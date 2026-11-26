// @effect-diagnostics nodeBuiltinImport:off
/**
 * Avi Code addition: sign in to Claude from Settings, per provider instance.
 *
 * Upstream tells a signed-out Claude instance to run `claude auth login`, which only signs in
 * the instance whose `CLAUDE_CONFIG_DIR` the user remembers to set. This runs the same command in
 * a PTY with the instance's own environment, so the login lands in that instance's config dir.
 */
import * as NodePath from "node:path";
import * as NodeUtil from "node:util";

import {
  ProviderSetupError,
  type ProviderAuthMethod,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import type { ServerProviderDraft } from "@t3tools/provider-core/server/snapshotProbe";
import { spawnAndCollect } from "@t3tools/provider-core/server/snapshotProbe";
import * as ProviderAuthFlow from "@t3tools/provider-core/server/providerAuthFlow";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { SpawnExecutableResolution, resolveSpawnCommand } from "@t3tools/shared/shell";

import { resolveClaudeSdkExecutablePath } from "../Drivers/ClaudeExecutable.ts";
import type { ProviderAuthController } from "../ProviderAuthService.ts";

export const CLAUDE_SIGN_IN_METHOD: ProviderAuthMethod = {
  id: "claudeai",
  name: "Claude subscription",
  description: "Sign in with your Claude plan in a terminal.",
  type: "terminal",
};

// `--claudeai` skips the subscription-or-Console chooser.
const LOGIN_ARGS = ["auth", "login", "--claudeai"];
const COMMAND_TIMEOUT = "30 seconds";
const MAX_OUTPUT_LENGTH = 16_384;
const MAX_FAILURE_LINES = 5;

// These sign in through the instance's environment, so `claude auth login` cannot change them.
const ENVIRONMENT_AUTH_TYPES: ReadonlySet<string> = new Set([
  "apiKey",
  "bedrock",
  "customEndpoint",
]);

export const withClaudeSignInSetup = (draft: ServerProviderDraft): ServerProviderDraft => ({
  ...draft,
  setup: {
    canAuthenticate: !(
      draft.auth.type !== undefined && ENVIRONMENT_AUTH_TYPES.has(draft.auth.type)
    ),
    canInstall: false,
  },
});

const isSetupError = Schema.is(ProviderSetupError);

const ClaudeAuthStatus = Schema.Struct({
  loggedIn: Schema.Boolean,
  email: Schema.optional(Schema.String),
});
const decodeClaudeAuthStatus = Schema.decodeUnknownOption(Schema.fromJsonString(ClaudeAuthStatus));

const lastPrintedLines = (output: string): string =>
  NodeUtil.stripVTControlCharacters(output)
    .split("\n")
    .map((line) => line.trimEnd())
    // A carriage return inside a line redraws it, so only the text after the last one is visible.
    .map((line) => line.slice(line.lastIndexOf("\r") + 1).trim())
    .filter((line) => line.length > 0)
    .slice(-MAX_FAILURE_LINES)
    .join(" ")
    .slice(-500);

const windowsComSpec = (environment: NodeJS.ProcessEnv): string =>
  Object.entries(environment).find(([name]) => name.toLowerCase() === "comspec")?.[1] ?? "cmd.exe";

/**
 * node-pty on Windows finds a bare name only on the server's own PATH, without PATHEXT, and
 * cannot start launcher scripts. Use the native claude.exe the SDK runs, else run the shim
 * through cmd.exe.
 */
export const resolveClaudeLoginCommand = Effect.fn("resolveClaudeLoginCommand")(function* (
  binaryPath: string,
  environment: NodeJS.ProcessEnv,
) {
  if ((yield* HostProcess.Platform) !== "win32") return { file: binaryPath, args: LOGIN_ARGS };
  const executable = yield* resolveClaudeSdkExecutablePath(binaryPath, environment);
  if (NodePath.win32.extname(executable).toLowerCase() === ".exe")
    return { file: executable, args: LOGIN_ARGS };
  const resolveExecutable = yield* SpawnExecutableResolution;
  const launcher =
    (yield* Effect.promise(async () => resolveExecutable(binaryPath, "win32", environment))) ??
    binaryPath;
  const extension = NodePath.win32.extname(launcher).toLowerCase();
  return extension === ".cmd" || extension === ".bat"
    ? { file: windowsComSpec(environment), args: ["/d", "/c", launcher, ...LOGIN_ARGS] }
    : { file: launcher, args: LOGIN_ARGS };
});

export const makeClaudeAuth = Effect.fn("makeClaudeAuth")(function* (options: {
  readonly instanceId: ProviderInstanceId;
  readonly enabled: boolean;
  readonly binaryPath: string;
  /** The resolved config dir; instances that share it share one login. */
  readonly configDir: string;
  /** The instance's spawn environment, carrying its `CLAUDE_CONFIG_DIR`. */
  readonly environment: NodeJS.ProcessEnv;
  readonly cwd: string;
  /** Re-probes the instance so its snapshot shows the new account. */
  readonly onChanged: Effect.Effect<void>;
}) {
  const pty = yield* Effect.serviceOption(PtyAdapter.PtyAdapter);
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const failure = (operation: string, detail: string, cause?: unknown) =>
    new ProviderSetupError({ instanceId: options.instanceId, operation, detail, cause });

  const runClaude = (operation: string, args: ReadonlyArray<string>) =>
    resolveSpawnCommand(options.binaryPath, args, { env: options.environment }).pipe(
      Effect.flatMap((spawn) =>
        spawnAndCollect(
          options.binaryPath,
          ChildProcess.make(spawn.command, spawn.args, {
            env: options.environment,
            shell: spawn.shell,
            cwd: options.cwd,
          }),
        ),
      ),
      Effect.scoped,
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.timeoutOrElse({
        duration: COMMAND_TIMEOUT,
        orElse: () => Effect.fail(failure(operation, "Claude did not answer in time. Try again.")),
      }),
      Effect.mapError((cause) =>
        isSetupError(cause)
          ? cause
          : failure(operation, "Could not run the Claude CLI on this environment.", cause),
      ),
    );

  const runLoginTerminal = Effect.fnUntraced(function* (
    context: ProviderAuthFlow.ProviderAuthFlowContext,
  ) {
    if (Option.isNone(pty))
      return yield* failure(
        "start",
        "In-app sign-in needs a terminal, which this environment does not have. Run `claude auth login` on its machine instead.",
      );
    const command = yield* resolveClaudeLoginCommand(options.binaryPath, options.environment);
    const exited = yield* Deferred.make<number>();
    const output = yield* Queue.sliding<string>(64);
    const process = yield* pty.value
      .spawn({
        shell: command.file,
        args: command.args,
        cwd: options.cwd,
        cols: 80,
        rows: 24,
        env: options.environment,
      })
      .pipe(
        Effect.mapError((cause) =>
          failure("start", "Could not open the Claude sign-in terminal.", cause),
        ),
      );
    // Kept in the callback so output that arrives just before exit is not lost to the reader.
    let printed = "";
    const detachData = process.onData((data) => {
      printed = (printed + data).slice(-4_096);
      Queue.offerUnsafe(output, data.slice(-MAX_OUTPUT_LENGTH));
    });
    const detachExit = process.onExit(({ exitCode }) => {
      Deferred.doneUnsafe(exited, Effect.succeed(exitCode));
    });
    yield* Effect.addFinalizer(() =>
      Effect.sync(() => {
        detachData();
        detachExit();
        try {
          process.kill();
        } catch {}
      }),
    );
    let transcript = "";
    let outputOffset = 0;
    const update = () =>
      context.setInteraction(
        { type: "terminal", id: "terminal", output: transcript, outputOffset },
        (response) =>
          response.type === "terminal"
            ? Effect.try({
                try: () => {
                  if (response.size) process.resize(response.size.cols, response.size.rows);
                  if (response.data)
                    process.write(PtyAdapter.ptyInput(response.data, response.binary));
                },
                catch: () => failure("respond", "The Claude sign-in terminal is no longer open."),
              })
            : Effect.void,
      );
    yield* update();
    yield* Queue.take(output).pipe(
      Effect.flatMap((data) => {
        outputOffset += data.length;
        transcript = (transcript + data).slice(-MAX_OUTPUT_LENGTH);
        return update();
      }),
      Effect.forever,
      Effect.forkScoped,
    );
    const exitCode = yield* Deferred.await(exited);
    if (exitCode !== 0) {
      const printedLines = lastPrintedLines(printed);
      return yield* failure(
        "start",
        printedLines.length > 0
          ? `Claude sign-in did not finish. ${printedLines}`
          : "Claude sign-in did not finish.",
      );
    }
  });

  const authenticate = Effect.fn("ClaudeAuth.authenticate")(function* (
    _methodId: string,
    context: ProviderAuthFlow.ProviderAuthFlowContext,
  ) {
    if (!options.enabled) return yield* failure("start", "Enable this provider before signing in.");
    yield* runLoginTerminal(context).pipe(Effect.scoped);
    yield* context.verifying;
    // The exit code does not say which login was saved; ask the CLI with the same environment.
    const result = yield* runClaude("verify", ["auth", "status", "--json"]);
    const status = decodeClaudeAuthStatus(result.stdout.trim());
    if (Option.isNone(status) || !status.value.loggedIn)
      return yield* failure("verify", "Claude did not save a login for this instance. Try again.");
    yield* options.onChanged;
  });

  const logout = runClaude("logout", ["auth", "logout"]).pipe(
    Effect.flatMap((result) =>
      result.code === 0
        ? Effect.void
        : Effect.fail(failure("logout", "Claude could not sign out. Try again.")),
    ),
    Effect.ensuring(options.onChanged),
  );

  const controller: ProviderAuthController = yield* ProviderAuthFlow.make({
    instanceId: options.instanceId,
    credentialBinding: { owner: "provider", key: `claude:${options.configDir}` },
    methods: Effect.succeed([CLAUDE_SIGN_IN_METHOD]),
    authenticate,
    logout,
  });
  return {
    ...controller,
    // Another instance on this config dir changed the login; show this one's new state too.
    invalidate: (controller.invalidate ?? Effect.void).pipe(Effect.andThen(options.onChanged)),
  } satisfies ProviderAuthController;
});
