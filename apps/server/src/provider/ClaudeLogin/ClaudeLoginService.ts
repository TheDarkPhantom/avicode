/**
 * Avi Code addition: run `claude auth login` for one provider instance from
 * inside the app.
 *
 * Upstream's answer to an unauthenticated Claude instance is the message
 * "Run `claude auth login` and try again" — which requires the user to know
 * that instances are isolated by `CLAUDE_CONFIG_DIR`, and to set it correctly
 * for the instance they meant. Getting that wrong silently signs the *default*
 * instance in again. This service removes the guesswork by spawning the CLI
 * with the instance's own resolved environment.
 *
 * The session is the process: the CLI prints an authorization URL, then blocks
 * on stdin for the code the browser returns, so it has to stay alive between
 * the two RPCs. `start` owns that lifetime and registers the process's stdin
 * so `submitCode` can reach it; interrupting the stream (closing the dialog)
 * closes the scope, which kills the CLI and deregisters the session.
 *
 * Success is confirmed by re-reading `claude auth status` rather than trusting
 * the exit code, so the reported email is the credential actually persisted to
 * that instance's config directory.
 *
 * @module provider/ClaudeLogin/ClaudeLoginService
 */
import {
  ClaudeLoginNotRunningError,
  ClaudeLoginProcessError,
  ClaudeLoginUnsupportedInstanceError,
  type ClaudeLoginError,
  type ClaudeLoginStartInput,
  type ClaudeLoginStreamEvent,
  type ClaudeLoginSubmitCodeInput,
  type ClaudeSettings,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import { resolveSpawnCommand } from "@t3tools/shared/shell";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ServerSettingsService } from "../../serverSettings.ts";
import { makeClaudeEnvironment } from "../Drivers/ClaudeHome.ts";
import { mergeProviderInstanceEnvironment } from "../ProviderInstanceEnvironment.ts";
import { makeClaudeLoginOutputScanner } from "./claudeLoginOutput.ts";
import { resolveClaudeLoginTarget } from "./claudeLoginSettings.ts";

/**
 * `--claudeai` pins the subscription flow. Without it the CLI renders an
 * interactive "subscription or Console" chooser, which needs arrow keys and a
 * TTY; with it the flow is pure pipes and this service needs no PTY.
 */
const LOGIN_ARGS = ["auth", "login", "--claudeai"] as const;
const AUTH_STATUS_ARGS = ["auth", "status"] as const;

const ClaudeAuthStatusJson = Schema.Struct({
  loggedIn: Schema.optional(Schema.Boolean),
  email: Schema.optional(Schema.String),
});
const decodeAuthStatus = Schema.decodeUnknownOption(Schema.fromJsonString(ClaudeAuthStatusJson));

const LINE_TERMINATOR = "\n";
const encoder = new TextEncoder();

export interface ClaudeLoginServiceShape {
  /**
   * Drive a sign-in for one instance. The stream's lifetime is the CLI's:
   * interrupting it cancels the sign-in.
   */
  readonly start: (
    input: ClaudeLoginStartInput,
  ) => Stream.Stream<ClaudeLoginStreamEvent, ClaudeLoginError>;

  /** Hand the CLI a pasted authorization code. */
  readonly submitCode: (input: ClaudeLoginSubmitCodeInput) => Effect.Effect<void, ClaudeLoginError>;
}

export class ClaudeLoginService extends Context.Service<
  ClaudeLoginService,
  ClaudeLoginServiceShape
>()("t3/provider/ClaudeLogin/ClaudeLoginService") {}

const processError = (detail: string) => new ClaudeLoginProcessError({ detail });

const describeCause = (cause: unknown): string =>
  cause instanceof Error && cause.message.length > 0 ? cause.message : String(cause);

export const makeClaudeLoginService = Effect.gen(function* () {
  const serverSettings = yield* ServerSettingsService;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const path = yield* Path.Path;
  // One in-flight sign-in per instance. Keyed by instance so two instances can
  // be signed in concurrently without their prompts crossing.
  const sessions = yield* Ref.make(new Map<ProviderInstanceId, Queue.Queue<Uint8Array>>());

  /**
   * Read back the credential that landed in the instance's config directory.
   * Returns `undefined` when the CLI reports anything other than a usable
   * login, including output this cannot parse.
   */
  const readAuthStatus = (claudeSettings: ClaudeSettings, baseEnv: NodeJS.ProcessEnv) =>
    Effect.gen(function* () {
      const env = yield* makeClaudeEnvironment(claudeSettings, baseEnv);
      const spawnCommand = yield* resolveSpawnCommand(claudeSettings.binaryPath, AUTH_STATUS_ARGS, {
        env,
      });
      const command = ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env,
        shell: spawnCommand.shell,
      });
      const stdout = yield* spawner.string(command);
      const decoded = decodeAuthStatus(stdout.trim());
      return Option.isSome(decoded) ? decoded.value : undefined;
    }).pipe(Effect.orElseSucceed(() => undefined));

  const start = (
    input: ClaudeLoginStartInput,
  ): Stream.Stream<ClaudeLoginStreamEvent, ClaudeLoginError> =>
    // `Path` is captured once at construction and pushed back in here so the
    // returned stream is context-free: the RPC layer hands it straight to a
    // client and has no provider environment of its own.
    Stream.provideService(
      Path.Path,
      path,
    )(
      Stream.unwrap(
        Effect.gen(function* () {
          const settings = yield* serverSettings.getSettings.pipe(
            Effect.mapError((cause) =>
              processError(`Could not read server settings: ${describeCause(cause)}`),
            ),
          );
          const target = resolveClaudeLoginTarget(settings, input.instanceId);
          if (!target) {
            return yield* new ClaudeLoginUnsupportedInstanceError({ instanceId: input.instanceId });
          }

          const baseEnv = mergeProviderInstanceEnvironment(target.environment);
          const env = yield* makeClaudeEnvironment(target.settings, baseEnv);
          const spawnCommand = yield* resolveSpawnCommand(target.settings.binaryPath, LOGIN_ARGS, {
            env,
          });
          const command = ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            env,
            shell: spawnCommand.shell,
          });
          const handle = yield* spawner
            .spawn(command)
            .pipe(
              Effect.mapError((cause) =>
                processError(
                  `Could not start ${target.settings.binaryPath}: ${describeCause(cause)}`,
                ),
              ),
            );

          // stdin stays open for the life of the process. A finished stream would
          // close it, and the CLI reads EOF as "cancelled" while it is still
          // waiting for the pasted code.
          const stdin = yield* Queue.unbounded<Uint8Array>();
          yield* Effect.forkScoped(
            Stream.run(Stream.fromQueue(stdin), handle.stdin).pipe(Effect.ignore),
          );

          yield* Effect.acquireRelease(
            Ref.update(sessions, (live) => new Map(live).set(input.instanceId, stdin)),
            () =>
              Ref.update(sessions, (live) => {
                const next = new Map(live);
                next.delete(input.instanceId);
                return next;
              }),
          );

          const scanner = makeClaudeLoginOutputScanner();
          // Both pipes feed one scanner: the CLI splits a single conversation
          // across them (prompt on stdout, rejection on stderr).
          const output = Stream.merge(
            handle.stdout.pipe(Stream.decodeText()),
            handle.stderr.pipe(Stream.decodeText()),
          ).pipe(
            Stream.map(
              (chunk: string): ReadonlyArray<ClaudeLoginStreamEvent> => scanner.push(chunk),
            ),
            Stream.flattenIterable,
            // A broken pipe means the CLI is gone; the exit code below decides
            // the outcome, so a read failure must not fail the whole stream.
            Stream.catchCause(() => Stream.empty),
          );

          const settled = Effect.gen(function* () {
            yield* handle.exitCode.pipe(Effect.orElseSucceed(() => 1));
            const status = yield* readAuthStatus(target.settings, baseEnv);
            if (status?.loggedIn === true) {
              return {
                type: "succeeded",
                email: status.email?.trim() ? status.email.trim() : null,
              } as const satisfies ClaudeLoginStreamEvent;
            }
            return {
              type: "failed",
              message:
                "Sign-in did not complete. No Claude credential was written for this instance.",
            } as const satisfies ClaudeLoginStreamEvent;
          });

          const configDirectory = path.resolve(target.settings.homePath.trim() || ".");
          yield* Effect.logInfo("Started an in-app Claude sign-in.", {
            instanceId: input.instanceId,
            configDirectory,
          });

          return Stream.succeed<ClaudeLoginStreamEvent>({ type: "started" }).pipe(
            Stream.concat(output),
            Stream.concat(Stream.fromEffect(settled)),
          );
        }),
      ),
    );

  const submitCode = (input: ClaudeLoginSubmitCodeInput) =>
    Effect.gen(function* () {
      const live = yield* Ref.get(sessions);
      const stdin = live.get(input.instanceId);
      if (!stdin) {
        return yield* new ClaudeLoginNotRunningError({ instanceId: input.instanceId });
      }
      yield* Queue.offer(stdin, encoder.encode(`${input.code}${LINE_TERMINATOR}`));
    });

  return { start, submitCode } satisfies ClaudeLoginServiceShape;
});

export const ClaudeLoginServiceLive = Layer.effect(ClaudeLoginService, makeClaudeLoginService);
