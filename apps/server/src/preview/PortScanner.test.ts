import { expect, it as effectIt } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";

import * as ProcessRunner from "../processRunner.ts";
import * as PortScanner from "./PortScanner.ts";
const TestProcessRunner = Layer.succeed(ProcessRunner.ProcessRunner, {
  run: (input) =>
    Effect.fail(
      new ProcessRunner.ProcessSpawnError({
        command: input.command,
        argumentCount: input.args.length,
        cwd: input.cwd,
        cause: PlatformError.systemError({
          _tag: "NotFound",
          module: "ChildProcess",
          method: "spawn",
          description: "PowerShell is not installed in the test environment",
        }),
      }),
    ),
});

const makeProbeFailureLayer = (run: ProcessRunner.ProcessRunner["Service"]["run"]) =>
  PortScanner.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ProcessRunner.ProcessRunner, { run }),
        Layer.succeed(HostProcessPlatform, "linux"),
      ),
    ),
  );

const TestPortDiscoveryLive = PortScanner.layer.pipe(
  Layer.provide(Layer.mergeAll(TestProcessRunner, Layer.succeed(HostProcessPlatform, "win32"))),
);

/** One `lsof -F pcn` record: pid 4321 running vite on localhost:5173. */
const lsofListenerOutput = "p4321\ncvite\nnlocalhost:5173\n";

const succeedWithStdout = (stdout: string) =>
  Effect.succeed({
    stdout,
    stderr: "",
    code: 0 as never,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  });

/**
 * Avi Code addition: a failed probe reports nothing rather than sweeping likely
 * dev ports. The sweep learned no owning terminal, and an unowned listener is
 * filtered out immediately, so it could only ever have returned rows the panel
 * then discarded.
 */
effectIt.effect("reports no local servers when the listener probe cannot run", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    expect(yield* scanner.scan()).toEqual([]);
  }).pipe(Effect.provide(TestPortDiscoveryLive)),
);

effectIt.effect("retain drives an immediate broadcast to subscribers", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    yield* scanner.registerTerminalProcesses({
      threadId: "thread-1",
      terminalId: "terminal-1",
      processIds: [4321],
    });

    const received: number[] = [];
    yield* scanner.subscribe((servers) =>
      Effect.sync(() => {
        for (const server of servers) received.push(server.port);
      }),
    );
    yield* scanner.retain;

    expect(received).toContain(5173);
  }).pipe(
    Effect.scoped,
    Effect.provide(makeProbeFailureLayer(() => succeedWithStdout(lsofListenerOutput))),
  ),
);

/**
 * Avi Code addition: the browser panel groups detected servers by the project
 * they belong to, which only works if the terminal's folder rides along with
 * the pid mapping the scanner already keeps.
 */
effectIt.effect("carries the owning terminal's folder onto a discovered server", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    yield* scanner.registerTerminalProcesses({
      threadId: "thread-1",
      terminalId: "terminal-1",
      processIds: [4321],
      cwd: "/repo/avicode",
      worktreePath: "/repo/avicode/.worktrees/feature",
    });

    const servers = yield* scanner.scan();
    const found = servers.find((server) => server.port === 5173);

    expect(found?.terminal).toEqual({
      threadId: "thread-1",
      terminalId: "terminal-1",
      cwd: "/repo/avicode",
      worktreePath: "/repo/avicode/.worktrees/feature",
    });
  }).pipe(
    Effect.provide(
      // A single lsof listener owned by pid 4321, so the join has something to
      // attach the registration to.
      makeProbeFailureLayer(() => succeedWithStdout(lsofListenerOutput)),
    ),
  ),
);

/**
 * Avi Code addition: a listener nothing in Avi Code started is not offered, so
 * the panel cannot fill up with the operating system and vendor tools again.
 */
effectIt.effect("drops a discovered listener that no terminal owns", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    expect(yield* scanner.scan()).toEqual([]);
  }).pipe(Effect.provide(makeProbeFailureLayer(() => succeedWithStdout(lsofListenerOutput)))),
);

effectIt.effect("does not swallow process probe defects", () =>
  Effect.gen(function* () {
    const defect = new Error("unexpected process probe defect");
    const layer = makeProbeFailureLayer(() => Effect.die(defect));

    const exit = yield* Effect.flatMap(PortScanner.PortDiscovery, (scanner) => scanner.scan()).pipe(
      Effect.provide(layer),
      Effect.exit,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(Cause.squash(exit.cause)).toBe(defect);
    }
  }),
);

effectIt.effect("does not swallow process probe interruption", () =>
  Effect.gen(function* () {
    const layer = makeProbeFailureLayer(() => Effect.interrupt);

    const exit = yield* Effect.flatMap(PortScanner.PortDiscovery, (scanner) => scanner.scan()).pipe(
      Effect.provide(layer),
      Effect.exit,
    );

    expect(Exit.isFailure(exit)).toBe(true);
    if (Exit.isFailure(exit)) {
      expect(Cause.hasInterruptsOnly(exit.cause)).toBe(true);
    }
  }),
);
