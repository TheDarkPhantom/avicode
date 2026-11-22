/**
 * In-process PortScanner implementation.
 *
 * macOS/Linux: parses `lsof -iTCP -sTCP:LISTEN -P -n -F pcn` (-F output is a
 * stable line-prefixed field format; this is the only `lsof` flag set we rely
 * on).
 *
 * Windows: parses `netstat -ano -p tcp|tcpv6` and names owners with `tasklist`.
 *
 * Polling is reference-counted via scoped `retain`. A single layer-scoped fiber
 * polls forever, but each tick is a no-op when the retain count is zero.
 *
 * Avi Code addition: on Windows a listener is also attributed to an agent when a
 * tracked agent CLI is one of its ancestors, and `stopServer` ends a listed
 * server's job with `taskkill /T`. Windows has no process groups and no readable
 * environment for other processes, so the process tree stands in for both.
 */
import {
  PreviewStopLocalServerError,
  ThreadId,
  type DiscoveredLocalServer,
  type PreviewStopLocalServerInput,
} from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { LSOF_LOCAL_HOST_TOKENS } from "@t3tools/shared/preview";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Ref from "effect/Ref";
import * as Schedule from "effect/Schedule";
import * as Scope from "effect/Scope";

import * as ProcessRunner from "../processRunner.ts";
// Avi Code addition: keeps listeners Avi Code did not start out of the browser panel.
import { filterBrowsableLocalServers } from "./localServerNoise.ts";

export class PortDiscovery extends Context.Service<
  PortDiscovery,
  {
    readonly scan: () => Effect.Effect<ReadonlyArray<DiscoveredLocalServer>>;
    readonly subscribe: (
      listener: (servers: ReadonlyArray<DiscoveredLocalServer>) => Effect.Effect<void>,
    ) => Effect.Effect<void, never, Scope.Scope>;
    readonly retain: Effect.Effect<void, never, Scope.Scope>;
    readonly registerTerminalProcesses: (input: {
      readonly threadId: string;
      readonly terminalId: string;
      readonly processIds: ReadonlyArray<number>;
      /**
       * Avi Code addition: where the terminal was opened. Carried through to the
       * client so a detected server can be recognised as belonging to a project,
       * not only to the one thread that happened to start it.
       */
      readonly cwd?: string | null;
      readonly worktreePath?: string | null;
    }) => Effect.Effect<void>;
    readonly unregisterTerminal: (input: {
      readonly threadId: string;
      readonly terminalId: string;
    }) => Effect.Effect<void>;
    /**
     * Records a running agent CLI until the returned function is called, so the
     * servers its jobs start are attributed to its thread. Synchronous because
     * provider spawn callbacks run outside Effect.
     */
    readonly trackAgent: (input: {
      readonly threadId: string;
      readonly pid: number;
      readonly cwd?: string | null;
    }) => () => void;
    /** Stops a listed server's job, never this server, an agent CLI, or a terminal shell. */
    readonly stopServer: (
      input: PreviewStopLocalServerInput,
    ) => Effect.Effect<void, PreviewStopLocalServerError>;
  }
>()("t3/preview/PortScanner/PortDiscovery") {}

const POLL_INTERVAL = Duration.seconds(3);
const LSOF_TIMEOUT_MS = 5_000;
const WINDOWS_LISTENER_TIMEOUT_MS = 5_000;
/** `netstat -ano` lists every connection, not just listeners; ~80 bytes per row, sized for ~200k rows. */
const WINDOWS_NETSTAT_MAX_OUTPUT_BYTES = 16 * 1024 * 1024;
/** Bounds how long a cached Windows image name can outlive its process if Windows reuses the PID. */
const WINDOWS_PROCESS_NAME_TTL_MS = Duration.toMillis(Duration.seconds(60));
const WINDOWS_PROCESS_NAME_CONCURRENCY = 4;
const WINDOWS_PROCESS_TABLE_TIMEOUT_MS = 10_000;
const WINDOWS_PROCESS_TABLE_MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const WINDOWS_TASKKILL_TIMEOUT_MS = 10_000;
/** `taskkill` exits 128 when the process is already gone. */
const TASKKILL_NOT_FOUND_EXIT_CODE = 128;
/** Bounds an ancestor walk, so a corrupt table cannot spin. */
const MAX_ANCESTRY_DEPTH = 64;
/** One `pid ppid creationMs` line per process. `-Property` keeps the CIM query cheap. */
const WINDOWS_PROCESS_TABLE_SCRIPT =
  'Get-CimInstance -ClassName Win32_Process -Property ProcessId,ParentProcessId,CreationDate -ErrorAction Stop | ForEach-Object { "$($_.ProcessId) $($_.ParentProcessId) $(if ($_.CreationDate) { ([DateTimeOffset]$_.CreationDate).ToUnixTimeMilliseconds() } else { 0 })" }';

type Listener = (servers: ReadonlyArray<DiscoveredLocalServer>) => Effect.Effect<void>;

interface ScannerState {
  readonly lastSnapshot: ReadonlyArray<DiscoveredLocalServer>;
  readonly listeners: ReadonlySet<Listener>;
  readonly terminalProcesses: ReadonlyMap<
    string,
    {
      readonly owner: TerminalProcessOwner;
      readonly processIds: ReadonlySet<number>;
    }
  >;
  readonly retainCount: number;
}

interface TerminalProcessOwner {
  readonly threadId: ThreadId;
  readonly terminalId: string;
  /** Avi Code addition: lets the client match a server to a project. */
  readonly cwd: string | null;
  readonly worktreePath: string | null;
}

type ServerOwner = Pick<DiscoveredLocalServer, "terminal" | "agent">;
type AgentOwner = NonNullable<DiscoveredLocalServer["agent"]>;

const UNOWNED: ServerOwner = { terminal: null, agent: null };

const isOwned = (server: DiscoveredLocalServer): boolean =>
  server.terminal !== null || (server.agent ?? null) !== null;

export interface ProcessTableRow {
  readonly pid: number;
  readonly ppid: number;
  /** Creation time. A parent created after its child means the parent's pid was reused. */
  readonly startedAtMs: number;
}

/** A listener pid's agent, or null for none, and the creation time it was read for. */
interface AgentAttribution {
  readonly owner: AgentOwner | null;
  readonly startedAtMs: number | null;
}

const terminalOwnerKey = (owner: {
  readonly threadId: string;
  readonly terminalId: string;
}): string => `${owner.threadId}\u0000${owner.terminalId}`;

const parseLsofOutput = (
  raw: string,
  owners: ReadonlyMap<number, ServerOwner> = new Map(),
): ReadonlyArray<DiscoveredLocalServer> => {
  const seen = new Map<string, DiscoveredLocalServer>();
  let pid: number | null = null;
  let processName: string | null = null;

  for (const line of raw.split("\n")) {
    if (line.length === 0) continue;
    const tag = line.charAt(0);
    const value = line.slice(1);
    if (tag === "p") {
      const parsed = Number.parseInt(value, 10);
      pid = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      processName = null;
      continue;
    }
    if (tag === "c") {
      processName = value.trim() || null;
      continue;
    }
    if (tag === "n") {
      const portMatch = parsePortFromLsofName(value);
      if (portMatch == null) continue;
      const url = `http://localhost:${portMatch}`;
      const key = `localhost:${portMatch}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        host: "localhost",
        port: portMatch,
        url,
        processName,
        pid,
        ...((pid === null ? undefined : owners.get(pid)) ?? UNOWNED),
      });
    }
  }

  return Array.from(seen.values()).toSorted((a, b) => a.port - b.port);
};

const parsePortFromLsofName = (name: string): number | null => {
  // Examples: "*:5173", "127.0.0.1:5173", "[::1]:5173", "localhost:5173",
  //           "192.168.1.10:5173 (LISTEN)" — we only care if the host part is local.
  const trimmed = name.split(" ", 1)[0]?.trim() ?? "";
  if (trimmed.length === 0) return null;
  const lastColon = trimmed.lastIndexOf(":");
  if (lastColon < 0) return null;
  const hostPart = trimmed.slice(0, lastColon);
  const portPart = trimmed.slice(lastColon + 1);
  if (!LSOF_LOCAL_HOST_TOKENS.has(hostPart)) return null;
  const port = Number.parseInt(portPart, 10);
  if (!Number.isFinite(port) || port <= 0 || port >= 65536) return null;
  return port;
};

const parseWindowsListenerLine = (
  line: string,
): {
  readonly host: string;
  readonly port: number;
  readonly pid: number | null;
  readonly processName: string | null;
} | null => {
  const trimmed = line.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.includes("|")) {
    const [hostRaw, portRaw, pidRaw, processNameRaw] = trimmed.split("|", 4);
    const host = hostRaw?.trim() ?? "";
    if (!LSOF_LOCAL_HOST_TOKENS.has(host) && host !== "::") return null;
    const port = Number(portRaw);
    const pid = Number(pidRaw);
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null;
    return {
      host,
      port,
      pid: Number.isInteger(pid) && pid > 0 ? pid : null,
      processName: processNameRaw?.trim() || null,
    };
  }

  // `netstat.exe -ano -p tcp` / `tcpv6`:
  //   TCP    127.0.0.1:3773         0.0.0.0:0              LISTENING       34280
  //   TCP    [::1]:35783            [::]:0                 LISTENING       22876
  // Foreign port `:0` identifies a listening TCP socket regardless of Windows locale.
  const fields = trimmed.split(/\s+/);
  if (fields.length < 4 || fields[0]?.toUpperCase() !== "TCP") return null;
  const localEndpoint = fields[1] ?? "";
  const foreignEndpoint = fields[2] ?? "";
  if (!foreignEndpoint.endsWith(":0")) return null;
  const lastColon = localEndpoint.lastIndexOf(":");
  if (lastColon <= 0) return null;
  const host = localEndpoint.slice(0, lastColon);
  if (!LSOF_LOCAL_HOST_TOKENS.has(host) && host !== "::") return null;
  const port = Number(localEndpoint.slice(lastColon + 1));
  if (!Number.isInteger(port) || port <= 0 || port >= 65536) return null;
  const pid = Number(fields.at(-1));
  return {
    host,
    port,
    pid: Number.isInteger(pid) && pid > 0 ? pid : null,
    processName: null,
  };
};

/** `ProcessRunner` reports a nonzero exit as a result, not a failure. */
const exitedWithError = (result: ProcessRunner.ProcessRunOutput): boolean =>
  result.code !== null && result.code !== 0;

/** Reads the image name from `tasklist.exe /FO CSV /NH /FI "PID eq <pid>"` output. */
const parseTasklistProcessName = (raw: string, pid: number): string | null => {
  for (const line of raw.split(/\r?\n/g)) {
    const match = /^"([^"]*)","(\d+)"/.exec(line.trim());
    if (match && Number(match[2]) === pid) return match[1]!.replace(/\.exe$/i, "") || null;
  }
  return null;
};

const parseWindowsListenerOutput = (raw: string): ReadonlyArray<DiscoveredLocalServer> => {
  const seen = new Map<number, DiscoveredLocalServer>();
  for (const line of raw.split(/\r?\n/g)) {
    const parsed = parseWindowsListenerLine(line);
    if (!parsed) continue;
    const { port, pid: normalizedPid, processName } = parsed;
    if (seen.has(port)) continue;
    seen.set(port, {
      host: "localhost",
      port,
      url: `http://localhost:${port}`,
      processName,
      pid: normalizedPid,
      ...UNOWNED,
    });
  }
  return [...seen.values()].toSorted((left, right) => left.port - right.port);
};

const withOwners = (
  servers: ReadonlyArray<DiscoveredLocalServer>,
  owners: ReadonlyMap<number, ServerOwner>,
): ReadonlyArray<DiscoveredLocalServer> =>
  servers.map((server) => {
    const owner = server.pid === null ? undefined : owners.get(server.pid);
    return owner === undefined ? server : { ...server, ...owner };
  });

/** Reads the `pid ppid creationMs` lines {@link WINDOWS_PROCESS_TABLE_SCRIPT} prints. */
export const parseWindowsProcessTable = (raw: string): ReadonlyMap<number, ProcessTableRow> => {
  const rows = new Map<number, ProcessTableRow>();
  for (const line of raw.split(/\r?\n/g)) {
    const [pid, ppid, startedAtMs] = line.trim().split(/\s+/).map(Number);
    if (Number.isInteger(pid) && Number.isInteger(ppid) && Number.isFinite(startedAtMs)) {
      rows.set(pid!, { pid: pid!, ppid: ppid!, startedAtMs: startedAtMs! });
    }
  }
  return rows;
};

/**
 * The live parent of `row`. Undefined when it exited, or when its pid now names a
 * process created after `row`, which cannot be its parent.
 */
const liveParent = (
  table: ReadonlyMap<number, ProcessTableRow>,
  row: ProcessTableRow,
): ProcessTableRow | undefined => {
  if (row.ppid <= 0 || row.ppid === row.pid) return undefined;
  const parent = table.get(row.ppid);
  return parent === undefined || parent.startedAtMs > row.startedAtMs ? undefined : parent;
};

/**
 * The agent whose CLI is an ancestor of `pid`. A CLI is not its own server, and a
 * chain broken by an exited intermediate process attributes nothing.
 */
export const agentOwnerOf = (
  table: ReadonlyMap<number, ProcessTableRow>,
  pid: number,
  agentRoots: ReadonlyMap<number, AgentOwner>,
): AgentOwner | null => {
  let row = table.get(pid);
  for (let depth = 0; row !== undefined && depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    const parent = liveParent(table, row);
    if (parent === undefined) return null;
    const owner = agentRoots.get(parent.pid);
    if (owner !== undefined) return owner;
    row = parent;
  }
  return null;
};

/**
 * The process whose tree stopping `pid` kills: its highest ancestor below a
 * protected process (this server and its ancestors, agent CLIs, terminal shells).
 * That is the job a shell or an agent tool started. When an intermediate process
 * already exited, the highest live ancestor is the job. Null when `pid` itself is
 * protected or unknown.
 */
export const stoppableProcess = (
  table: ReadonlyMap<number, ProcessTableRow>,
  pid: number,
  protectedPids: ReadonlySet<number>,
): number | null => {
  let row = table.get(pid);
  if (row === undefined || protectedPids.has(pid)) return null;
  for (let depth = 0; depth < MAX_ANCESTRY_DEPTH; depth += 1) {
    const parent = liveParent(table, row);
    if (parent === undefined || protectedPids.has(parent.pid)) return row.pid;
    row = parent;
  }
  return null;
};

const serversEqual = (
  left: ReadonlyArray<DiscoveredLocalServer>,
  right: ReadonlyArray<DiscoveredLocalServer>,
): boolean => {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    const a = left[i];
    const b = right[i];
    if (!a || !b) return false;
    if (
      a.host !== b.host ||
      a.port !== b.port ||
      a.url !== b.url ||
      a.processName !== b.processName ||
      a.pid !== b.pid ||
      a.terminal?.threadId !== b.terminal?.threadId ||
      a.terminal?.terminalId !== b.terminal?.terminalId ||
      a.agent?.threadId !== b.agent?.threadId
    ) {
      return false;
    }
  }
  return true;
};

export const make = Effect.gen(function* PortDiscoveryMake() {
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const hostPlatform = yield* HostProcessPlatform;
  const stateRef = yield* Ref.make<ScannerState>({
    lastSnapshot: [],
    listeners: new Set(),
    terminalProcesses: new Map(),
    retainCount: 0,
  });
  /** Windows image names by PID; netstat reports only PIDs. */
  const windowsProcessNamesRef = yield* Ref.make<
    ReadonlyMap<number, { readonly name: string | null; readonly expiresAtMillis: number }>
  >(new Map());
  // Agent CLIs this server spawned, by pid. Plain state because `trackAgent` runs in
  // provider spawn callbacks.
  const agentRoots = new Map<number, AgentOwner>();
  // Each current listener pid's agent. A process's ancestry is fixed when it starts, so a
  // pid is read once while it listens, and its server stays attributed after the agent exits.
  const agentAttributionsRef = yield* Ref.make<ReadonlyMap<number, AgentAttribution>>(new Map());
  // Set while no client retains the scanner: pids went unscanned and may have been reused,
  // so kept attributions are checked against a fresh process table before they count again.
  let attributionsNeedCheck = false;

  /**
   * Avi Code addition: there is no fallback probe any more. Only a listener the
   * process probe can attribute to an Avi Code terminal is offered, and a TCP
   * sweep of likely ports learns no owner, so everything it found was discarded
   * a moment later. Failing to an empty snapshot says the same thing for free.
   */
  const recoverProcessProbeFailure =
    (probe: "lsof" | "windows-listeners") => (error: ProcessRunner.ProcessRunError) =>
      Effect.logDebug("preview port process probe failed; reporting no local servers", {
        cause: error,
        probe,
        platform: hostPlatform,
      }).pipe(Effect.as(null));

  // `tasklist` costs ~200-300ms per PID, so look up only offered servers, a few at a time, and
  // reuse each name until its TTL expires.
  const withWindowsProcessNames = Effect.fn("PortDiscovery.withWindowsProcessNames")(function* (
    servers: ReadonlyArray<DiscoveredLocalServer>,
  ) {
    const pids = new Set(servers.flatMap((server) => (server.pid === null ? [] : [server.pid])));
    const nowMillis = yield* Clock.currentTimeMillis;
    const cached = [...(yield* Ref.get(windowsProcessNamesRef))].filter(
      ([pid, entry]) => pids.has(pid) && entry.expiresAtMillis > nowMillis,
    );
    const cachedPids = new Set(cached.map(([pid]) => pid));
    const expiresAtMillis = nowMillis + WINDOWS_PROCESS_NAME_TTL_MS;
    const fetched = yield* Effect.forEach(
      [...pids].filter((pid) => !cachedPids.has(pid)),
      (pid) =>
        processRunner
          .run({
            command: "tasklist.exe",
            args: ["/FO", "CSV", "/NH", "/FI", `PID eq ${pid}`],
            timeout: Duration.millis(WINDOWS_LISTENER_TIMEOUT_MS),
            maxOutputBytes: 64 * 1024,
          })
          .pipe(
            // Only a completed lookup is cached; failures retry on the next scan.
            Effect.map((result) =>
              exitedWithError(result)
                ? []
                : [
                    [
                      pid,
                      { name: parseTasklistProcessName(result.stdout, pid), expiresAtMillis },
                    ] as const,
                  ],
            ),
            Effect.orElseSucceed(() => []),
          ),
      { concurrency: WINDOWS_PROCESS_NAME_CONCURRENCY },
    );
    const names = new Map([...cached, ...fetched.flat()]);
    yield* Ref.set(windowsProcessNamesRef, names);
    return servers.map((server) =>
      server.pid === null || server.processName !== null
        ? server
        : { ...server, processName: names.get(server.pid)?.name ?? null },
    );
  });

  /** A fresh Windows process table, or None when PowerShell could not produce one. */
  const readWindowsProcessTable = Effect.suspend(() =>
    processRunner.run({
      // powershell.exe is a real executable; never route the script through cmd.exe.
      command: "powershell.exe",
      args: ["-NoProfile", "-NonInteractive", "-Command", WINDOWS_PROCESS_TABLE_SCRIPT],
      timeout: Duration.millis(WINDOWS_PROCESS_TABLE_TIMEOUT_MS),
      maxOutputBytes: WINDOWS_PROCESS_TABLE_MAX_OUTPUT_BYTES,
    }),
  ).pipe(
    Effect.map((result) => {
      // An empty table must never read as every process having exited.
      const table = exitedWithError(result)
        ? new Map<number, ProcessTableRow>()
        : parseWindowsProcessTable(result.stdout);
      return table.size === 0 ? Option.none() : Option.some(table);
    }),
    Effect.orElseSucceed(() => Option.none<ReadonlyMap<number, ProcessTableRow>>()),
  );

  const hasAgentAttributions = (attributions: ReadonlyMap<number, AgentAttribution>) =>
    [...attributions.values()].some((attribution) => attribution.owner !== null);

  /**
   * Agent owners for the given listener pids. Reads the process table only when a new pid
   * appears while an agent runs, or when kept attributions need checking after an idle gap.
   */
  const resolveAgentOwners = Effect.fn("PortDiscovery.resolveAgentOwners")(function* (
    pids: ReadonlyArray<number>,
  ) {
    const cached = yield* Ref.get(agentAttributionsRef);
    const unread = pids.filter((pid) => !cached.has(pid));
    const needsTable =
      (unread.length > 0 && agentRoots.size > 0) ||
      (attributionsNeedCheck && pids.some((pid) => (cached.get(pid)?.owner ?? null) !== null));
    const table = needsTable ? yield* readWindowsProcessTable : Option.none();
    if (Option.isSome(table)) attributionsNeedCheck = false;

    const next = new Map<number, AgentAttribution>();
    for (const pid of pids) {
      const entry = cached.get(pid);
      if (Option.isSome(table)) {
        const row = table.value.get(pid);
        next.set(
          pid,
          entry !== undefined && row !== undefined && entry.startedAtMs === row.startedAtMs
            ? entry
            : {
                owner: row === undefined ? null : agentOwnerOf(table.value, pid, agentRoots),
                startedAtMs: row?.startedAtMs ?? null,
              },
        );
      } else if (entry !== undefined) {
        next.set(pid, entry);
      } else if (!needsTable) {
        // No agent runs, and one started later cannot be an ancestor of this pid.
        next.set(pid, { owner: null, startedAtMs: null });
      }
      // Otherwise the table read failed; the pid is read again on the next scan.
    }
    yield* Ref.set(agentAttributionsRef, next);

    const owners = new Map<number, AgentOwner>();
    if (attributionsNeedCheck) return owners;
    for (const [pid, attribution] of next) {
      if (attribution.owner !== null) owners.set(pid, attribution.owner);
    }
    return owners;
  });

  const terminalOwners = (state: ScannerState): Map<number, ServerOwner> => {
    const owners = new Map<number, ServerOwner>();
    for (const registration of state.terminalProcesses.values()) {
      for (const processId of registration.processIds) {
        owners.set(processId, { terminal: registration.owner, agent: null });
      }
    }
    return owners;
  };

  const scanAllListeners = Effect.fn("PortDiscovery.scanAll")(function* () {
    const state = yield* Ref.get(stateRef);
    const owners = terminalOwners(state);
    if (hostPlatform === "win32") {
      // Only owned listeners are offered, so with no terminal and no agent there is
      // nothing to look for.
      const agentsPossible =
        agentRoots.size > 0 || hasAgentAttributions(yield* Ref.get(agentAttributionsRef));
      if (owners.size === 0 && !agentsPossible) return [];
      const recoverWindowsProbeFailure = recoverProcessProbeFailure("windows-listeners");
      const runNetstat = (protocol: "tcp" | "tcpv6") =>
        processRunner.run({
          command: "netstat.exe",
          args: ["-ano", "-p", protocol],
          timeout: Duration.millis(WINDOWS_LISTENER_TIMEOUT_MS),
          maxOutputBytes: WINDOWS_NETSTAT_MAX_OUTPUT_BYTES,
        });
      const listeners = yield* Effect.all([runNetstat("tcp"), runNetstat("tcpv6")], {
        concurrency: 2,
      }).pipe(
        // One failed query leaves a partial snapshot that could hide another process sharing a
        // port across IPv4/IPv6, so report nothing instead.
        Effect.map(([tcp4, tcp6]) =>
          exitedWithError(tcp4) || exitedWithError(tcp6)
            ? null
            : parseWindowsListenerOutput(`${tcp4.stdout}\n${tcp6.stdout}`),
        ),
        Effect.catchTags({
          ProcessSpawnError: recoverWindowsProbeFailure,
          ProcessStdinError: recoverWindowsProbeFailure,
          ProcessOutputLimitError: recoverWindowsProbeFailure,
          ProcessReadError: recoverWindowsProbeFailure,
          ProcessTimeoutError: recoverWindowsProbeFailure,
        }),
      );
      if (listeners === null) return [];
      if (agentsPossible) {
        const unowned = new Set(
          listeners.flatMap((server) =>
            server.pid === null || owners.has(server.pid) ? [] : [server.pid],
          ),
        );
        for (const [pid, agent] of yield* resolveAgentOwners([...unowned])) {
          owners.set(pid, { terminal: null, agent });
        }
      }
      return withOwners(listeners, owners);
    }
    const recoverLsofProbeFailure = recoverProcessProbeFailure("lsof");
    const lsofResult = yield* processRunner
      .run({
        command: "lsof",
        args: ["-iTCP", "-sTCP:LISTEN", "-P", "-n", "-F", "pcn"],
        timeout: Duration.millis(LSOF_TIMEOUT_MS),
        maxOutputBytes: 1024 * 1024,
        outputMode: "truncate",
      })
      .pipe(
        Effect.map((result) => parseLsofOutput(result.stdout, owners)),
        Effect.catchTags({
          ProcessSpawnError: recoverLsofProbeFailure,
          ProcessStdinError: recoverLsofProbeFailure,
          ProcessOutputLimitError: recoverLsofProbeFailure,
          ProcessReadError: recoverLsofProbeFailure,
          ProcessTimeoutError: recoverLsofProbeFailure,
        }),
      );
    return lsofResult ?? [];
  });

  /**
   * Avi Code addition: the probes above enumerate every listening socket on the
   * machine, which on Windows is mostly the operating system and vendor tools.
   * Filtering here rather than in each probe keeps the lsof and Windows paths
   * consistent, and keeps everything Avi Code did not start out of the snapshot
   * the panel diffs against, so a service starting no longer counts as a change
   * and no longer costs a broadcast.
   */
  const scanOnce = Effect.fn("PortDiscovery.scan")(function* () {
    const servers = filterBrowsableLocalServers(yield* scanAllListeners());
    return hostPlatform === "win32" ? yield* withWindowsProcessNames(servers) : servers;
  });

  const broadcast = Effect.fn("PortDiscovery.broadcast")(function* (
    servers: ReadonlyArray<DiscoveredLocalServer>,
  ) {
    const listeners = (yield* Ref.get(stateRef)).listeners;
    yield* Effect.forEach(listeners, (listener) => listener(servers), { discard: true });
  });

  const pollTick = Effect.fn("PortDiscovery.pollTick")(
    function* () {
      if ((yield* Ref.get(stateRef)).retainCount <= 0) return;
      const next = yield* scanOnce();
      const changed = yield* Ref.modify(stateRef, (state) =>
        serversEqual(state.lastSnapshot, next)
          ? [false, state]
          : [true, { ...state, lastSnapshot: next }],
      );
      if (changed) yield* broadcast(next);
    },
    Effect.catchCause((cause: Cause.Cause<never>) =>
      Effect.logWarning("preview port scan failed", Cause.pretty(cause)),
    ),
  );

  // Single layer-scoped polling fiber. Ticks are no-ops when no client is
  // currently retained, so the cost is one Ref.get every POLL_INTERVAL.
  yield* Effect.forkScoped(pollTick().pipe(Effect.repeat(Schedule.spaced(POLL_INTERVAL))));

  const acquireRetention = Effect.fn("PortDiscovery.retain")(function* () {
    const wasIdle = yield* Ref.modify(stateRef, (state) => [
      state.retainCount === 0,
      { ...state, retainCount: state.retainCount + 1 },
    ]);
    if (wasIdle) {
      // Run an immediate scan + broadcast so the new retainer doesn't have
      // to wait up to POLL_INTERVAL for the first emission.
      yield* pollTick();
    }
  });

  const releaseRetention = Effect.gen(function* () {
    const idle = yield* Ref.modify(stateRef, (state) => {
      const retainCount = Math.max(0, state.retainCount - 1);
      return [retainCount === 0, { ...state, retainCount }] as const;
    });
    if (idle) attributionsNeedCheck = true;
  });

  const retain: PortDiscovery["Service"]["retain"] = Effect.acquireRelease(
    acquireRetention(),
    () => releaseRetention,
  );

  const subscribe: PortDiscovery["Service"]["subscribe"] = Effect.fn("PortDiscovery.subscribe")(
    (listener) =>
      Effect.acquireRelease(
        Ref.update(stateRef, (state) => ({
          ...state,
          listeners: new Set([...state.listeners, listener]),
        })),
        () =>
          Ref.update(stateRef, (state) => {
            const listeners = new Set(state.listeners);
            listeners.delete(listener);
            return { ...state, listeners };
          }),
      ),
  );

  const registerTerminalProcesses: PortDiscovery["Service"]["registerTerminalProcesses"] =
    Effect.fn("PortDiscovery.registerTerminalProcesses")(function* (input) {
      const owner = {
        threadId: ThreadId.make(input.threadId),
        terminalId: input.terminalId,
        cwd: input.cwd ?? null,
        worktreePath: input.worktreePath ?? null,
      };
      const processIds = new Set(
        input.processIds.filter((processId) => Number.isInteger(processId) && processId > 0),
      );
      yield* Ref.update(stateRef, (state) => {
        const terminalProcesses = new Map(state.terminalProcesses);
        const key = terminalOwnerKey(owner);
        if (processIds.size === 0) {
          terminalProcesses.delete(key);
        } else {
          terminalProcesses.set(key, { owner, processIds });
        }
        return { ...state, terminalProcesses };
      });
    });

  const unregisterTerminal: PortDiscovery["Service"]["unregisterTerminal"] = Effect.fn(
    "PortDiscovery.unregisterTerminal",
  )(function* (input) {
    yield* Ref.update(stateRef, (state) => {
      const terminalProcesses = new Map(state.terminalProcesses);
      terminalProcesses.delete(terminalOwnerKey(input));
      return { ...state, terminalProcesses };
    });
  });

  const trackAgent: PortDiscovery["Service"]["trackAgent"] = (input) => {
    if (!Number.isInteger(input.pid) || input.pid <= 0) return () => undefined;
    const owner: AgentOwner = {
      threadId: ThreadId.make(input.threadId),
      ...(input.cwd ? { cwd: input.cwd } : {}),
    };
    agentRoots.set(input.pid, owner);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (agentRoots.get(input.pid) === owner) agentRoots.delete(input.pid);
    };
  };

  /**
   * Processes a stop must never kill: this server and its ancestors, agent CLIs, and each
   * terminal's shell (the registered process whose parent is not registered with it).
   */
  const protectedProcesses = Effect.fn("PortDiscovery.protectedProcesses")(function* (
    table: ReadonlyMap<number, ProcessTableRow>,
  ) {
    const pids = new Set<number>([process.pid, ...agentRoots.keys()]);
    let row = table.get(process.pid);
    for (let depth = 0; row !== undefined && depth < MAX_ANCESTRY_DEPTH; depth += 1) {
      row = liveParent(table, row);
      if (row !== undefined) pids.add(row.pid);
    }
    for (const registration of (yield* Ref.get(stateRef)).terminalProcesses.values()) {
      for (const pid of registration.processIds) {
        const member = table.get(pid);
        const parent = member === undefined ? undefined : liveParent(table, member);
        if (parent === undefined || !registration.processIds.has(parent.pid)) pids.add(pid);
      }
    }
    return pids;
  });

  const killProcessTree = (pid: number) =>
    processRunner
      .run({
        command: "taskkill.exe",
        args: ["/PID", String(pid), "/T", "/F"],
        timeout: Duration.millis(WINDOWS_TASKKILL_TIMEOUT_MS),
        maxOutputBytes: 64 * 1024,
      })
      .pipe(
        Effect.mapError(
          (cause) => new PreviewStopLocalServerError({ reason: "signal-failed", cause }),
        ),
        Effect.flatMap((result) =>
          !exitedWithError(result) || result.code === TASKKILL_NOT_FOUND_EXIT_CODE
            ? Effect.void
            : Effect.fail(
                new PreviewStopLocalServerError({
                  reason: "signal-failed",
                  cause: new Error(result.stderr.trim() || `taskkill exited ${result.code}`),
                }),
              ),
        ),
      );

  const stopListedServer = Effect.fn("PortDiscovery.stopListedServer")(function* (
    input: PreviewStopLocalServerInput,
  ) {
    if (hostPlatform !== "win32") {
      return yield* new PreviewStopLocalServerError({ reason: "unsupported" });
    }
    // The pid comes from a client, so only a server this scan lists for a thread is stopped.
    const listed = (yield* scanOnce()).find(
      (server) => server.pid === input.pid && server.port === input.port && isOwned(server),
    );
    if (listed === undefined) {
      return yield* new PreviewStopLocalServerError({ reason: "not-found" });
    }
    const table = yield* readWindowsProcessTable;
    if (Option.isNone(table)) {
      return yield* new PreviewStopLocalServerError({ reason: "signal-failed" });
    }
    const row = table.value.get(input.pid);
    // It exited after the scan, so there is nothing left to stop.
    if (row === undefined) return;
    // An agent's server is trusted only while its pid still names the process attributed.
    if (listed.terminal === null) {
      const attribution = (yield* Ref.get(agentAttributionsRef)).get(input.pid);
      if (attribution?.startedAtMs !== row.startedAtMs) {
        return yield* new PreviewStopLocalServerError({ reason: "not-found" });
      }
    }
    const job = stoppableProcess(table.value, input.pid, yield* protectedProcesses(table.value));
    if (job === null) {
      return yield* new PreviewStopLocalServerError({ reason: "shared-group" });
    }
    yield* killProcessTree(job);
  });

  const stopServer: PortDiscovery["Service"]["stopServer"] = (input) =>
    // Subscribers see the server leave now rather than on the next poll.
    stopListedServer(input).pipe(Effect.andThen(pollTick()));

  return PortDiscovery.of({
    scan: scanOnce,
    subscribe,
    retain,
    registerTerminalProcesses,
    unregisterTerminal,
    trackAgent,
    stopServer,
  });
}).pipe(Effect.withSpan("PortDiscovery.make"));

export const layer = Layer.effect(PortDiscovery, make);
