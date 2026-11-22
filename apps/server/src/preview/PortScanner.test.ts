// @effect-diagnostics nodeBuiltinImport:off -- the Windows stop test drives real server processes.
import * as NodeChildProcess from "node:child_process";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it as effectIt } from "@effect/vitest";
import { ThreadId } from "@t3tools/contracts";
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

/**
 * A Windows process tree under this server: an agent CLI (200) whose tool shell (300)
 * runs `npm run dev` (400) and its node server (401), a terminal shell (500) and its
 * job (600), and an operating system service (900).
 */
const windowsTree = (overrides: Readonly<Record<number, number>> = {}) =>
  new Map(
    [
      { pid: process.pid, ppid: 1, startedAtMs: 1_000 },
      { pid: 200, ppid: process.pid, startedAtMs: 2_000 },
      { pid: 300, ppid: 200, startedAtMs: 3_000 },
      { pid: 400, ppid: 300, startedAtMs: 4_000 },
      { pid: 401, ppid: 400, startedAtMs: 4_100 },
      { pid: 500, ppid: process.pid, startedAtMs: 5_000 },
      { pid: 600, ppid: 500, startedAtMs: 6_000 },
      { pid: 900, ppid: 4, startedAtMs: 500 },
    ].map((row) => [row.pid, { ...row, startedAtMs: overrides[row.pid] ?? row.startedAtMs }]),
  );

const printTable = (table: ReadonlyMap<number, PortScanner.ProcessTableRow>) =>
  [...table.values()].map((row) => `${row.pid} ${row.ppid} ${row.startedAtMs}`).join("\r\n");

const netstatLine = (port: number, pid: number) =>
  `  TCP    127.0.0.1:${port}         0.0.0.0:0              LISTENING       ${pid}\r\n`;

/** Fakes netstat, tasklist, the PowerShell process table, and taskkill. */
const makeWindowsHost = () => {
  const host = {
    listeners: [netstatLine(5173, 401), netstatLine(7000, 200), netstatLine(135, 900)],
    table: windowsTree() as ReadonlyMap<number, PortScanner.ProcessTableRow>,
    tableReads: 0,
    netstatReads: 0,
    killed: [] as Array<ReadonlyArray<string>>,
  };
  const layer = makeWindowsProbeLayer((input) => {
    switch (input.command) {
      case "netstat.exe":
        host.netstatReads += 1;
        return windowsProbeOutput(input.args.includes("tcpv6") ? "" : host.listeners.join(""));
      case "tasklist.exe":
        return windowsProbeOutput("");
      case "powershell.exe":
        host.tableReads += 1;
        return windowsProbeOutput(printTable(host.table));
      case "taskkill.exe":
        host.killed.push(input.args);
        return windowsProbeOutput("");
      default:
        return Effect.die(new Error(`unexpected command ${input.command}`));
    }
  });
  return { host, layer };
};

effectIt.effect("finds the job a Windows stop kills, never a protected process", () =>
  Effect.sync(() => {
    const table = windowsTree();
    const protectedPids = new Set([process.pid, 1, 200, 500]);
    // The agent tool shell is the job under the agent CLI; a terminal job under its shell.
    expect(PortScanner.stoppableProcess(table, 401, protectedPids)).toBe(300);
    expect(PortScanner.stoppableProcess(table, 600, protectedPids)).toBe(600);
    // The agent CLI, a terminal shell, and this server are never a job.
    for (const pid of [200, 500, process.pid, 12345]) {
      expect(PortScanner.stoppableProcess(table, pid, protectedPids)).toBeNull();
    }
    // An exited tool shell leaves its job as the highest live ancestor.
    const orphaned = new Map(table);
    orphaned.delete(300);
    expect(PortScanner.stoppableProcess(orphaned, 401, protectedPids)).toBe(400);
  }),
);

effectIt.effect("attributes a Windows process to the agent CLI above it", () =>
  Effect.sync(() => {
    const agent = { threadId: ThreadId.make("thread-agent") };
    const roots = new Map([[200, agent]]);
    expect(PortScanner.agentOwnerOf(windowsTree(), 401, roots)).toBe(agent);
    // The CLI is not its own server, and other processes are not the agent's.
    for (const pid of [200, 600, 900]) {
      expect(PortScanner.agentOwnerOf(windowsTree(), pid, roots)).toBeNull();
    }
    // A parent pid reused by a newer process is not an ancestor.
    expect(PortScanner.agentOwnerOf(windowsTree({ 300: 9_000 }), 401, roots)).toBeNull();
    expect(
      PortScanner.parseWindowsProcessTable("4 0 1795143637569\r\n\r\n432 4 1795143632741\r\n"),
    ).toEqual(
      new Map([
        [4, { pid: 4, ppid: 0, startedAtMs: 1795143637569 }],
        [432, { pid: 432, ppid: 4, startedAtMs: 1795143632741 }],
      ]),
    );
  }),
);

effectIt.effect(
  "lists a Windows agent's server after the agent exits, reading the process table once",
  () => {
    const { host, layer } = makeWindowsHost();
    return Effect.gen(function* () {
      const scanner = yield* PortScanner.PortDiscovery;
      // With no terminal and no agent nothing is probed.
      expect(yield* scanner.scan()).toEqual([]);
      expect(host.tableReads).toBe(0);

      const release = scanner.trackAgent({ threadId: "thread-agent", pid: 200, cwd: "C:\\repo" });
      const expected = [
        {
          port: 5173,
          pid: 401,
          terminal: null,
          agent: { threadId: "thread-agent", cwd: "C:\\repo" },
        },
      ];
      expect(yield* scanner.scan()).toMatchObject(expected);
      expect(yield* scanner.scan()).toMatchObject(expected);
      expect(host.tableReads).toBe(1);

      // The server outlives its agent. A listener that appears afterwards is nobody's,
      // and no agent runs, so the table is not read for it.
      release();
      host.listeners = [...host.listeners, netstatLine(5174, 402)];
      expect(yield* scanner.scan()).toMatchObject(expected);
      expect(host.tableReads).toBe(1);

      // Once it stops listening nothing is left to look for, so netstat stops running.
      host.listeners = [netstatLine(135, 900)];
      expect(yield* scanner.scan()).toEqual([]);
      const netstatReads = host.netstatReads;
      expect(yield* scanner.scan()).toEqual([]);
      expect(host.netstatReads).toBe(netstatReads);
    }).pipe(Effect.provide(layer));
  },
);

effectIt.effect("stops a listed Windows server by killing only its job's tree", () => {
  const { host, layer } = makeWindowsHost();
  host.listeners = [...host.listeners, netstatLine(3000, 600), netstatLine(4000, 500)];
  return Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    scanner.trackAgent({ threadId: "thread-agent", pid: 200 });
    yield* scanner.registerTerminalProcesses({
      threadId: "thread-terminal",
      terminalId: "terminal-1",
      processIds: [500, 600],
    });
    const reason = (input: { readonly pid: number; readonly port: number }) =>
      Effect.flip(scanner.stopServer(input)).pipe(Effect.map((error) => error.reason));

    yield* scanner.stopServer({ pid: 401, port: 5173 });
    yield* scanner.stopServer({ pid: 600, port: 3000 });
    expect(host.killed).toEqual([
      ["/PID", "300", "/T", "/F"],
      ["/PID", "600", "/T", "/F"],
    ]);

    // Unlisted servers and mismatched ports are refused without killing anything.
    expect(yield* reason({ pid: 900, port: 135 })).toBe("not-found");
    expect(yield* reason({ pid: 200, port: 7000 })).toBe("not-found");
    expect(yield* reason({ pid: 401, port: 9999 })).toBe("not-found");
    // A terminal shell that listens is the terminal itself.
    expect(yield* reason({ pid: 500, port: 4000 })).toBe("shared-group");
    // A pid that now names a different process is not the server that was attributed.
    host.table = windowsTree({ 401: 7_000 });
    expect(yield* reason({ pid: 401, port: 5173 })).toBe("not-found");
    expect(host.killed).toHaveLength(2);
  }).pipe(Effect.provide(layer));
});

effectIt.effect("refuses to stop servers off Windows", () =>
  Effect.gen(function* () {
    const scanner = yield* PortScanner.PortDiscovery;
    const error = yield* Effect.flip(scanner.stopServer({ pid: 4321, port: 5173 }));
    expect(error.reason).toBe("unsupported");
  }).pipe(Effect.provide(makeProbeFailureLayer(() => succeedWithStdout(lsofListenerOutput)))),
);

const LIVE_SERVER_SCRIPT = `
const server = require("node:http").createServer((_, response) => response.end("ok"));
server.listen(0, "127.0.0.1", () => {
  process.stdout.write(process.pid + " " + server.address().port + "\\n");
});
`;

/** Stands in for an agent CLI: starts the server as its job, then idles. */
const LIVE_AGENT_SCRIPT = `
const job = require("node:child_process").spawn(process.execPath, ["-e", process.argv[1]], {
  stdio: ["ignore", "pipe", "ignore"],
});
job.stdout.pipe(process.stdout);
setInterval(() => {}, 1000);
`;

const isRunning = (pid: number): boolean => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/** A real agent with a real server job. Release kills only the pids it started. */
const liveAgent = () =>
  Effect.acquireRelease(
    Effect.callback<{
      readonly agentPid: number;
      readonly pid: number;
      readonly port: number;
    }>((resume) => {
      const agent = NodeChildProcess.spawn(
        process.execPath,
        ["-e", LIVE_AGENT_SCRIPT, LIVE_SERVER_SCRIPT],
        { stdio: ["ignore", "pipe", "ignore"], windowsHide: true },
      );
      agent.once("error", (error) => resume(Effect.die(error)));
      agent.stdout?.once("data", (chunk) => {
        const [pid, port] = String(chunk).trim().split(" ").map(Number);
        resume(Effect.succeed({ agentPid: agent.pid!, pid: pid!, port: port! }));
      });
    }),
    ({ agentPid, pid }) =>
      Effect.sync(() => {
        for (const target of [pid, agentPid]) {
          try {
            process.kill(target);
          } catch {}
        }
      }),
  );

effectIt.live.skipIf(HostProcessPlatform.defaultValue() !== "win32")(
  "stops a real Windows agent server's job and leaves the agent running",
  () =>
    Effect.gen(function* () {
      const scanner = yield* PortScanner.PortDiscovery;
      const job = yield* liveAgent();
      yield* Effect.acquireRelease(
        Effect.sync(() => scanner.trackAgent({ threadId: "thread-live", pid: job.agentPid })),
        (release) => Effect.sync(release),
      );

      expect(yield* scanner.scan()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            pid: job.pid,
            port: job.port,
            agent: { threadId: "thread-live" },
          }),
        ]),
      );
      const unlisted = yield* Effect.flip(scanner.stopServer({ pid: process.pid, port: job.port }));
      expect(unlisted.reason).toBe("not-found");

      yield* scanner.stopServer({ pid: job.pid, port: job.port });
      expect(isRunning(job.pid)).toBe(false);
      expect(isRunning(job.agentPid)).toBe(true);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        PortScanner.layer.pipe(
          Layer.provide(ProcessRunner.layer),
          Layer.provide(NodeServices.layer),
        ),
      ),
    ),
  30_000,
);
