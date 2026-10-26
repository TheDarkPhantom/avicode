import { expect, it as effectIt } from "@effect/vitest";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import * as Cause from "effect/Cause";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as PlatformError from "effect/PlatformError";
import * as TestClock from "effect/testing/TestClock";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

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

const windowsProbeOutput = (stdout: string, failed = false) =>
  Effect.succeed({
    stdout,
    stderr: "",
    code: failed ? ChildProcessSpawner.ExitCode(1) : null,
    timedOut: false,
    stdoutTruncated: false,
    stderrTruncated: false,
  });

const makeWindowsProbeLayer = (run: ProcessRunner.ProcessRunner["Service"]["run"]) =>
  PortScanner.layer.pipe(
    Layer.provide(
      Layer.mergeAll(
        Layer.succeed(ProcessRunner.ProcessRunner, { run }),
        Layer.succeed(HostProcessPlatform, "win32"),
      ),
    ),
  );

effectIt.effect(
  "parses Windows netstat listeners, names them via tasklist with retry, and skips spawns when idle",
  () => {
    const spawnedArgs: Array<ReadonlyArray<string>> = [];
    let tasklistCalls = 0;
    const layer = makeWindowsProbeLayer((input) => {
      spawnedArgs.push(input.args);
      const isTasklist = input.command === "tasklist.exe";
      // The first lookup fails, so it must not be cached as "no name".
      const failTasklist = isTasklist && tasklistCalls++ === 0;
      return windowsProbeOutput(
        isTasklist
          ? '"node.exe","1234","Console","1","93,164 K"\r\n'
          : input.args.includes("tcpv6")
            ? "  TCP    [::1]:43123            [::]:0                 ABHÖREN         1234\r\n  TCP    [::1]:43123            [::1]:52000            HERGESTELLT     1234\r\n"
            : "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       1234\r\n  TCP    127.0.0.1:5173         127.0.0.1:60123        ESTABLISHED     9999\r\n",
        failTasklist,
      );
    });

    return Effect.gen(function* () {
      const scanner = yield* PortScanner.PortDiscovery;
      expect(yield* scanner.scan()).toEqual([]);
      expect(spawnedArgs).toHaveLength(0);

      yield* scanner.registerTerminalProcesses({
        threadId: "scanner-thread",
        terminalId: "scanner-terminal",
        processIds: [1234],
      });
      const summarize = (
        servers: ReadonlyArray<{
          readonly port: number;
          readonly pid: number | null;
          readonly processName: string | null;
        }>,
      ) =>
        servers.map((entry) => ({
          port: entry.port,
          pid: entry.pid,
          processName: entry.processName,
        }));
      expect(summarize(yield* scanner.scan())).toEqual([
        { port: 5173, pid: 1234, processName: null },
        { port: 43123, pid: 1234, processName: null },
      ]);
      expect(spawnedArgs).toEqual([
        ["-ano", "-p", "tcp"],
        ["-ano", "-p", "tcpv6"],
        ["/FO", "CSV", "/NH", "/FI", "PID eq 1234"],
      ]);

      // The failed lookup retries; the result is then cached, so later polls spawn only netstat.
      expect(summarize(yield* scanner.scan())).toEqual([
        { port: 5173, pid: 1234, processName: "node" },
        { port: 43123, pid: 1234, processName: "node" },
      ]);
      yield* scanner.scan();
      expect(tasklistCalls).toBe(2);

      // Cached names expire, since Windows may hand the PID to another process.
      yield* TestClock.adjust(Duration.seconds(61));
      yield* scanner.scan();
      expect(tasklistCalls).toBe(3);
    }).pipe(Effect.provide(layer));
  },
);

effectIt.effect("ignores a partial Windows netstat snapshot when one query exits nonzero", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    yield* scanner.registerTerminalProcesses({
      threadId: "scanner-thread",
      terminalId: "scanner-terminal",
      processIds: [1234],
    });
    expect(yield* scanner.scan()).toEqual([]);
  }).pipe(
    Effect.provide(
      makeWindowsProbeLayer((input) =>
        input.args.includes("tcpv6")
          ? windowsProbeOutput("", true)
          : windowsProbeOutput(
              "  TCP    127.0.0.1:5173         0.0.0.0:0              LISTENING       1234\r\n",
            ),
      ),
    ),
  ),
);
