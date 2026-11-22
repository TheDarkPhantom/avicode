import { describe, expect, it, vi } from "vite-plus/test";
import { EnvironmentId, ThreadId, type TerminalSummary } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Option from "effect/Option";
import { AsyncResult, AtomRegistry } from "effect/unstable/reactivity";

import { knownTerminalSessionsAtom } from "./terminalSessions";

const metadataAtom = await vi.hoisted(async () => {
  const { AsyncResult, Atom } = await import("effect/unstable/reactivity");
  return Atom.make<AsyncResult.AsyncResult<ReadonlyArray<TerminalSummary>>>(
    AsyncResult.initial(true),
  );
});
vi.mock("./terminal", () => ({
  terminalEnvironment: { metadata: () => metadataAtom },
}));

const environmentA = EnvironmentId.make("environment-a");
const threadA = ThreadId.make("thread-a");
const threadB = ThreadId.make("thread-b");

function summary(threadId: string, terminalId: string): TerminalSummary {
  return {
    threadId,
    terminalId,
    cwd: "/repo",
    worktreePath: null,
    status: "running",
    pid: 123,
    exitCode: null,
    exitSignal: null,
    hasRunningSubprocess: true,
    label: "Terminal",
    updatedAt: "2026-09-04T00:00:00.000Z",
  };
}

const metadataResult = (...terminals: ReadonlyArray<TerminalSummary>) =>
  AsyncResult.success<ReadonlyArray<TerminalSummary>>(terminals);

describe("knownTerminalSessionsAtom", () => {
  it("notifies only when the thread's own terminals change", () => {
    const registry = AtomRegistry.make();
    const sessions = knownTerminalSessionsAtom(environmentA, threadA);
    expect(registry.get(sessions)).toEqual([]);

    const first = summary(threadA, "terminal-1");
    const other = summary(threadB, "terminal-1");
    registry.set(metadataAtom, metadataResult(first));
    const notified: unknown[] = [];
    const unsubscribe = registry.subscribe(sessions, (value) => notified.push(value));
    const before = registry.get(sessions);
    notified.length = 0; // the subscription's own first computation
    expect(before.map((session) => session.target.terminalId)).toEqual(["terminal-1"]);

    registry.set(metadataAtom, metadataResult(first, other));
    registry.set(metadataAtom, metadataResult(first, { ...other, label: "Renamed" }));
    expect(notified).toEqual([]);
    expect(registry.get(sessions)).toBe(before);

    registry.set(metadataAtom, metadataResult({ ...first, label: "Renamed" }, other));
    expect(notified).toHaveLength(1);

    // A failed resubscribe keeps showing the last known terminals.
    const previousSuccess = Option.some(metadataResult(first));
    registry.set(metadataAtom, AsyncResult.failure(Cause.die("unavailable"), { previousSuccess }));
    expect(registry.get(sessions).map((session) => session.state.summary)).toEqual([first]);
    unsubscribe();
  });

  it("sorts a thread's terminals by numeric id", () => {
    const registry = AtomRegistry.make();
    const sessions = knownTerminalSessionsAtom(environmentA, null);
    registry.set(
      metadataAtom,
      metadataResult(summary(threadA, "terminal-10"), summary(threadB, "terminal-2")),
    );
    expect(registry.get(sessions).map((session) => session.target.terminalId)).toEqual([
      "terminal-2",
      "terminal-10",
    ]);
  });
});
