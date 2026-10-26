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
 */
import { ThreadId, type DiscoveredLocalServer } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { LSOF_LOCAL_HOST_TOKENS } from "@t3tools/shared/preview";
import * as Cause from "effect/Cause";
import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
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

const terminalOwnerKey = (owner: {
  readonly threadId: string;
  readonly terminalId: string;
}): string => `${owner.threadId}\u0000${owner.terminalId}`;

const parseLsofOutput = (
  raw: string,
  terminalByProcessId: ReadonlyMap<number, TerminalProcessOwner> = new Map(),
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
        terminal: pid === null ? null : (terminalByProcessId.get(pid) ?? null),
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

const parseWindowsListenerOutput = (
  raw: string,
  terminalByProcessId: ReadonlyMap<number, TerminalProcessOwner> = new Map(),
): ReadonlyArray<DiscoveredLocalServer> => {
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
      terminal: normalizedPid === null ? null : (terminalByProcessId.get(normalizedPid) ?? null),
    });
  }
  return [...seen.values()].toSorted((left, right) => left.port - right.port);
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
      a.terminal?.terminalId !== b.terminal?.terminalId
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

  const scanAllListeners = Effect.fn("PortDiscovery.scanAll")(function* () {
    const state = yield* Ref.get(stateRef);
    const terminalByProcessId = new Map<number, TerminalProcessOwner>();
    for (const registration of state.terminalProcesses.values()) {
      for (const processId of registration.processIds) {
        terminalByProcessId.set(processId, registration.owner);
      }
    }
    if (hostPlatform === "win32") {
      // Only terminal-owned listeners are offered, so with no terminal there is
      // nothing to look for.
      if (terminalByProcessId.size === 0) return [];
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
            : parseWindowsListenerOutput(`${tcp4.stdout}\n${tcp6.stdout}`, terminalByProcessId),
        ),
        Effect.catchTags({
          ProcessSpawnError: recoverWindowsProbeFailure,
          ProcessStdinError: recoverWindowsProbeFailure,
          ProcessOutputLimitError: recoverWindowsProbeFailure,
          ProcessReadError: recoverWindowsProbeFailure,
          ProcessTimeoutError: recoverWindowsProbeFailure,
        }),
      );
      return listeners ?? [];
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
        Effect.map((result) => parseLsofOutput(result.stdout, terminalByProcessId)),
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

  const retain: PortDiscovery["Service"]["retain"] = Effect.acquireRelease(acquireRetention(), () =>
    Ref.update(stateRef, (state) => ({
      ...state,
      retainCount: Math.max(0, state.retainCount - 1),
    })),
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

  return PortDiscovery.of({
    scan: scanOnce,
    subscribe,
    retain,
    registerTerminalProcesses,
    unregisterTerminal,
  });
}).pipe(Effect.withSpan("PortDiscovery.make"));

export const layer = Layer.effect(PortDiscovery, make);
