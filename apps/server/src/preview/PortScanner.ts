/**
 * In-process PortScanner implementation.
 *
 * macOS/Linux: parses `lsof -iTCP -sTCP:LISTEN -P -n -F pcn` (-F output is a
 * stable line-prefixed field format; this is the only `lsof` flag set we rely
 * on).
 *
 * Windows: parses `Get-NetTCPConnection -State Listen` through PowerShell.
 *
 * Polling is reference-counted via scoped `retain`. A single layer-scoped fiber
 * polls forever, but each tick is a no-op when the retain count is zero.
 */
import { ThreadId, type DiscoveredLocalServer } from "@t3tools/contracts";
import { HostProcessPlatform } from "@t3tools/shared/hostProcess";
import { LSOF_LOCAL_HOST_TOKENS } from "@t3tools/shared/preview";
import * as Cause from "effect/Cause";
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

const parseWindowsListenerOutput = (
  raw: string,
  terminalByProcessId: ReadonlyMap<number, TerminalProcessOwner> = new Map(),
): ReadonlyArray<DiscoveredLocalServer> => {
  const seen = new Map<number, DiscoveredLocalServer>();
  for (const line of raw.split(/\r?\n/g)) {
    const [hostRaw, portRaw, pidRaw, processNameRaw] = line.trim().split("|", 4);
    const host = hostRaw?.trim() ?? "";
    if (!LSOF_LOCAL_HOST_TOKENS.has(host) && host !== "::") continue;
    const port = Number(portRaw);
    const pid = Number(pidRaw);
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) continue;
    const normalizedPid = Number.isInteger(pid) && pid > 0 ? pid : null;
    if (seen.has(port)) continue;
    seen.set(port, {
      host: "localhost",
      port,
      url: `http://localhost:${port}`,
      processName: processNameRaw?.trim() || null,
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

  const scanAllListeners = Effect.fn("PortDiscovery.scanAll")(function* () {
    const state = yield* Ref.get(stateRef);
    const terminalByProcessId = new Map<number, TerminalProcessOwner>();
    for (const registration of state.terminalProcesses.values()) {
      for (const processId of registration.processIds) {
        terminalByProcessId.set(processId, registration.owner);
      }
    }
    if (hostPlatform === "win32") {
      const recoverWindowsProbeFailure = recoverProcessProbeFailure("windows-listeners");
      const command =
        'Get-NetTCPConnection -State Listen -ErrorAction Stop | ForEach-Object { $processName = (Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue).ProcessName; Write-Output "$($_.LocalAddress)|$($_.LocalPort)|$($_.OwningProcess)|$processName" }';
      const listeners = yield* processRunner
        .run({
          command: "powershell.exe",
          args: ["-NoProfile", "-NonInteractive", "-Command", command],
          timeout: Duration.millis(WINDOWS_LISTENER_TIMEOUT_MS),
          maxOutputBytes: 1024 * 1024,
          outputMode: "truncate",
        })
        .pipe(
          Effect.map((result) => parseWindowsListenerOutput(result.stdout, terminalByProcessId)),
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
    return filterBrowsableLocalServers(yield* scanAllListeners());
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
