import * as NodeCrypto from "@effect/platform-node/NodeCrypto";
import { assert, it } from "@effect/vitest";
import { ProviderInstanceId, type ProviderAuthState } from "@t3tools/contracts";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import type * as Scope from "effect/Scope";
import * as Sink from "effect/Sink";
import * as Stream from "effect/Stream";
import { ChildProcess, ChildProcessSpawner } from "effect/process";

import * as HostProcess from "@t3tools/shared/HostProcess";
import * as PtyAdapter from "@t3tools/shared/PtyAdapter";
import { SpawnExecutableResolution } from "@t3tools/shared/shell";
import type { ServerProviderDraft } from "@t3tools/provider-core/server/snapshotProbe";

import { ClaudeExecutableFileCheck } from "../Drivers/ClaudeExecutable.ts";
import {
  CLAUDE_SIGN_IN_METHOD,
  makeClaudeAuth,
  resolveClaudeLoginCommand,
  withClaudeSignInSetup,
} from "./ClaudeAuth.ts";

interface Ran {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
  readonly env: ChildProcess.CommandOptions["env"];
}

const fakeSpawner = (ran: Ran[], answer: (args: ReadonlyArray<string>) => [number, string]) =>
  ChildProcessSpawner.make((command) =>
    Effect.sync(() => {
      const args = ChildProcess.isStandardCommand(command) ? command.args.map(String) : [];
      if (ChildProcess.isStandardCommand(command))
        ran.push({ command: command.command, args, env: command.options.env });
      const [code, stdout] = answer(args);
      return ChildProcessSpawner.makeHandle({
        pid: ChildProcessSpawner.ProcessId(1),
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(code)),
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        unref: Effect.succeed(Effect.void),
        stdin: Sink.drain,
        stdout: Stream.encodeText(Stream.make(stdout)),
        stderr: Stream.empty,
        all: Stream.empty,
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
      });
    }),
  );

const makeHarness = (input: {
  readonly instanceId?: string;
  readonly configDir?: string;
  readonly loggedIn?: boolean;
  readonly logoutCode?: number;
  readonly withPty?: boolean;
}) =>
  Effect.gen(function* () {
    const instanceId = ProviderInstanceId.make(input.instanceId ?? "claudeAgent_lawrence");
    const configDir = input.configDir ?? "/home/me/.claude-lawrence";
    const ran: Ran[] = [];
    let changed = 0;
    let spawned: PtyAdapter.PtySpawnInput | undefined;
    let data: ((data: string) => void) | undefined;
    let exit: ((event: PtyAdapter.PtyExitEvent) => void) | undefined;
    let killed = false;
    const written: Array<string | Buffer> = [];
    const pty: PtyAdapter.PtyAdapter["Service"] = {
      spawn: (spawnInput) =>
        Effect.sync(() => {
          spawned = spawnInput;
          return {
            pid: 7,
            write: (value) => {
              written.push(value);
            },
            resize: () => {},
            kill: () => {
              killed = true;
            },
            onData: (callback) => {
              data = callback;
              return () => {
                data = undefined;
              };
            },
            onExit: (callback) => {
              exit = callback;
              return () => {
                exit = undefined;
              };
            },
          };
        }),
    };
    const build = makeClaudeAuth({
      instanceId,
      enabled: true,
      binaryPath: "claude",
      configDir,
      environment: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: configDir },
      cwd: "/state",
      onChanged: Effect.sync(() => {
        changed += 1;
      }),
    }).pipe(
      Effect.provideService(
        ChildProcessSpawner.ChildProcessSpawner,
        fakeSpawner(ran, (args) =>
          args[1] === "status"
            ? [
                input.loggedIn === false ? 1 : 0,
                JSON.stringify({ loggedIn: input.loggedIn ?? true }),
              ]
            : [input.logoutCode ?? 0, ""],
        ),
      ),
    );
    const controller =
      input.withPty === false
        ? yield* build
        : yield* build.pipe(Effect.provideService(PtyAdapter.PtyAdapter, pty));
    const state = (predicate: (state: ProviderAuthState) => boolean) =>
      controller
        .subscribe("owner")
        .pipe(Stream.filter(predicate), Stream.runHead, Effect.map(Option.getOrThrow));
    const phase = (value: ProviderAuthState["phase"]) =>
      state((current) => current.phase === value);
    return {
      instanceId,
      controller,
      ran,
      state,
      phase,
      changed: () => changed,
      spawned: () => spawned,
      data: (value: string) => data?.(value),
      exit: (exitCode: number) => exit?.({ exitCode, signal: null }),
      killed: () => killed,
      written,
    };
  }).pipe(Effect.provideService(HostProcess.Platform, "linux"));

const run = <A, E>(effect: Effect.Effect<A, E, Scope.Scope | SecureRandom.SecureRandom>) =>
  effect.pipe(Effect.scoped, Effect.provide(NodeCrypto.layer));

it.effect("offers one terminal method and binds the login to the config dir", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      const listed = yield* h.state((value) => (value.methods?.length ?? 0) > 0);
      assert.deepEqual(listed.methods, [CLAUDE_SIGN_IN_METHOD]);
      assert.deepEqual(h.controller.credentialBinding, {
        owner: "provider",
        key: "claude:/home/me/.claude-lawrence",
      });
      const sharing = yield* makeHarness({ instanceId: "claudeAgent_other" });
      assert.deepEqual(sharing.controller.credentialBinding, h.controller.credentialBinding);
    }),
  ),
);

it.effect("runs the login in a terminal with the instance's config dir, then verifies it", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      const flow = yield* h.controller.start("owner", Effect.void, "claudeai");
      yield* h.phase("waiting");
      assert.deepEqual(h.spawned(), {
        shell: "claude",
        args: ["auth", "login", "--claudeai"],
        cwd: "/state",
        cols: 80,
        rows: 24,
        env: { PATH: "/usr/bin", CLAUDE_CONFIG_DIR: "/home/me/.claude-lawrence" },
      });
      h.data("Paste code here if prompted > ");
      yield* h.state(
        (value) =>
          value.interaction?.type === "terminal" &&
          value.interaction.output === "Paste code here if prompted > ",
      );
      yield* h.controller.respond!("owner", {
        instanceId: h.instanceId,
        flowId: flow.flowId!,
        interactionId: "terminal",
        response: { type: "terminal", data: "code#state\r" },
      });
      assert.deepEqual(h.written, ["code#state\r"]);
      h.exit(0);
      yield* h.phase("succeeded");
      assert.isTrue(h.killed());
      assert.deepEqual(
        h.ran.map((entry) => entry.args),
        [["auth", "status", "--json"]],
      );
      assert.strictEqual(h.ran[0]?.env?.CLAUDE_CONFIG_DIR, "/home/me/.claude-lawrence");
      assert.strictEqual(h.changed(), 1);
    }),
  ),
);

it.effect("fails when the CLI exits cleanly but saved no login", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({ loggedIn: false });
      yield* h.controller.start("owner");
      yield* h.phase("waiting");
      h.exit(0);
      const failed = yield* h.phase("failed");
      assert.strictEqual(
        failed.message,
        "Claude did not save a login for this instance. Try again.",
      );
      assert.strictEqual(h.changed(), 0);
    }),
  ),
);

it.effect("shows what the login printed when it exits non-zero", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      yield* h.controller.start("owner");
      yield* h.phase("waiting");
      h.data("\u001b[31mOAuth error: invalid code\u001b[0m\r\n");
      h.exit(1);
      const failed = yield* h.phase("failed");
      assert.strictEqual(
        failed.message,
        "Claude sign-in did not finish. OAuth error: invalid code",
      );
      assert.deepEqual(h.ran, []);
      assert.strictEqual(h.changed(), 0);
    }),
  ),
);

it.effect("cancelling closes the login terminal", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      const flow = yield* h.controller.start("owner");
      yield* h.phase("waiting");
      yield* h.controller.cancel("owner", flow.flowId!);
      assert.isTrue(h.killed());
      assert.deepEqual(h.ran, []);
      assert.strictEqual(h.changed(), 0);
    }),
  ),
);

it.effect("fails clearly when the environment has no terminal", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({ withPty: false });
      yield* h.controller.start("owner");
      const failed = yield* h.phase("failed");
      assert.include(failed.message, "Run `claude auth login`");
    }),
  ),
);

it.effect("signs out with the instance's environment and refreshes it", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      const state = yield* h.controller.logout(Effect.void);
      assert.strictEqual(state.phase, "idle");
      assert.deepEqual(h.ran[0]?.args, ["auth", "logout"]);
      assert.strictEqual(h.ran[0]?.env?.CLAUDE_CONFIG_DIR, "/home/me/.claude-lawrence");
      assert.strictEqual(h.changed(), 1);

      const failing = yield* makeHarness({ logoutCode: 1 });
      const result = yield* failing.controller.logout(Effect.void).pipe(Effect.result);
      assert.strictEqual(result._tag, "Failure");
      assert.strictEqual(failing.changed(), 1);
    }),
  ),
);

it.effect("refreshes an instance when another one on its config dir changes the login", () =>
  run(
    Effect.gen(function* () {
      const h = yield* makeHarness({});
      yield* h.controller.invalidate!;
      assert.strictEqual(h.changed(), 1);
    }),
  ),
);

it.effect("starts the native claude.exe on Windows, and a launcher script through cmd.exe", () =>
  Effect.gen(function* () {
    const environment = { ComSpec: "C:\\Windows\\system32\\cmd.exe" };
    const native = yield* resolveClaudeLoginCommand("claude", environment).pipe(
      Effect.provideService(
        SpawnExecutableResolution,
        () => "C:\\Users\\me\\.local\\bin\\claude.exe",
      ),
    );
    assert.deepEqual(native, {
      file: "C:\\Users\\me\\.local\\bin\\claude.exe",
      args: ["auth", "login", "--claudeai"],
    });
    const npmShim = yield* resolveClaudeLoginCommand("claude", environment).pipe(
      Effect.provideService(SpawnExecutableResolution, () => "C:\\npm\\claude.cmd"),
      Effect.provideService(ClaudeExecutableFileCheck, (file) =>
        file.endsWith("claude-code\\bin\\claude.exe"),
      ),
    );
    assert.deepEqual(npmShim, {
      file: "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe",
      args: ["auth", "login", "--claudeai"],
    });
    const unknownShim = yield* resolveClaudeLoginCommand("claude", environment).pipe(
      Effect.provideService(SpawnExecutableResolution, () => "C:\\tools\\claude.cmd"),
      Effect.provideService(ClaudeExecutableFileCheck, () => false),
    );
    assert.deepEqual(unknownShim, {
      file: "C:\\Windows\\system32\\cmd.exe",
      args: ["/d", "/c", "C:\\tools\\claude.cmd", "auth", "login", "--claudeai"],
    });
  }).pipe(Effect.provideService(HostProcess.Platform, "win32")),
);

it("hides sign-in for instances that authenticate through their environment", () => {
  const draft = (type?: string) =>
    ({
      auth: { status: "authenticated", ...(type ? { type } : {}) },
      setup: { canAuthenticate: false, canInstall: false },
    }) as ServerProviderDraft;
  assert.deepEqual(withClaudeSignInSetup(draft("max")).setup, {
    canAuthenticate: true,
    canInstall: false,
  });
  assert.isTrue(withClaudeSignInSetup(draft()).setup?.canAuthenticate);
  assert.isFalse(withClaudeSignInSetup(draft("apiKey")).setup?.canAuthenticate);
  assert.isFalse(withClaudeSignInSetup(draft("bedrock")).setup?.canAuthenticate);
  assert.isFalse(withClaudeSignInSetup(draft("customEndpoint")).setup?.canAuthenticate);
});
