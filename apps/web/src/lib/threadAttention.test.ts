import { describe, expect, it } from "vite-plus/test";
import type { OrchestrationLatestTurn, OrchestrationSession } from "@t3tools/contracts";

import {
  resolveAttentionChimes,
  resolveThreadAttention,
  type ThreadAttentionInput,
  type ThreadAttentionKind,
} from "./threadAttention";

const COMPLETED_AT = "2026-07-29T10:05:00.000Z";
const BEFORE_COMPLETION = "2026-07-29T10:04:00.000Z";
const AFTER_COMPLETION = "2026-07-29T10:06:00.000Z";

function makeLatestTurn(): OrchestrationLatestTurn {
  return {
    turnId: "turn-1" as never,
    state: "completed",
    assistantMessageId: null,
    requestedAt: "2026-07-29T10:00:00.000Z",
    startedAt: "2026-07-29T10:00:00.000Z",
    completedAt: COMPLETED_AT,
  };
}

function makeThread(overrides: Partial<ThreadAttentionInput> = {}): ThreadAttentionInput {
  return {
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    interactionMode: "default",
    latestTurn: makeLatestTurn(),
    session: null,
    ...overrides,
  };
}

function makeSession(status: OrchestrationSession["status"]): OrchestrationSession {
  return {
    threadId: "thread-1" as never,
    status,
    providerName: "codex",
    runtimeMode: "auto",
    activeTurnId: null,
    lastError: null,
    updatedAt: "2026-07-29T10:05:00.000Z",
  };
}

describe("resolveThreadAttention", () => {
  it("reports an unread completion as done", () => {
    expect(resolveThreadAttention(makeThread(), BEFORE_COMPLETION)).toBe("done");
  });

  it("reports nothing once the completion has been seen", () => {
    expect(resolveThreadAttention(makeThread(), AFTER_COMPLETION)).toBe(null);
  });

  it("ranks a blocked agent above an unread completion", () => {
    expect(
      resolveThreadAttention(makeThread({ hasPendingApprovals: true }), BEFORE_COMPLETION),
    ).toBe("approval");
    expect(
      resolveThreadAttention(makeThread({ hasPendingUserInput: true }), BEFORE_COMPLETION),
    ).toBe("input");
  });

  // A thread that started working again is not waiting on the user, even if
  // nobody ever read the turn before it — the sidebar shows Working, so the
  // chime must agree.
  it("reports nothing for a thread that is working again", () => {
    expect(
      resolveThreadAttention(makeThread({ session: makeSession("running") }), BEFORE_COMPLETION),
    ).toBe(null);
    expect(
      resolveThreadAttention(makeThread({ session: makeSession("starting") }), BEFORE_COMPLETION),
    ).toBe(null);
  });

  it("still reports a blocked agent while a session is live", () => {
    expect(
      resolveThreadAttention(
        makeThread({ hasPendingApprovals: true, session: makeSession("running") }),
        AFTER_COMPLETION,
      ),
    ).toBe("approval");
  });
});

function snapshot(
  entries: Readonly<Record<string, ThreadAttentionKind | null>>,
): ReadonlyMap<string, ThreadAttentionKind | null> {
  return new Map(Object.entries(entries));
}

describe("resolveAttentionChimes", () => {
  it("chimes when a thread enters an attention state", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({ a: null }),
        current: snapshot({ a: "done" }),
        suppressedThreadKey: null,
      }),
    ).toEqual(["a"]);
  });

  it("stays silent while a thread sits in the same state", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({ a: "done" }),
        current: snapshot({ a: "done" }),
        suppressedThreadKey: null,
      }),
    ).toEqual([]);
  });

  it("chimes again when one attention state replaces another", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({ a: "input" }),
        current: snapshot({ a: "approval" }),
        suppressedThreadKey: null,
      }),
    ).toEqual(["a"]);
  });

  // The bootstrap guard: a newly connected environment arrives with its whole
  // backlog already in an attention state, and none of it is news.
  it("never chimes on the first observation of a thread", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({}),
        current: snapshot({ a: "done", b: "approval" }),
        suppressedThreadKey: null,
      }),
    ).toEqual([]);
  });

  it("suppresses the thread the user is already looking at", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({ a: null, b: null }),
        current: snapshot({ a: "done", b: "done" }),
        suppressedThreadKey: "a",
      }),
    ).toEqual(["b"]);
  });

  it("reports every thread that transitioned so a batch collapses to one decision", () => {
    expect(
      resolveAttentionChimes({
        previous: snapshot({ a: null, b: "done", c: null }),
        current: snapshot({ a: "done", b: "done", c: "input" }),
        suppressedThreadKey: null,
      }),
    ).toEqual(["a", "c"]);
  });
});
