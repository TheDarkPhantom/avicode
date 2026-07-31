import { describe, expect, it } from "vite-plus/test";

import type { MergeRunThreadInput } from "./projectMergeRun.logic";
import { resolveMergeRunCandidates, summarizeMergeRun } from "./projectMergeRun.logic";

function thread(overrides: Partial<MergeRunThreadInput> = {}): MergeRunThreadInput {
  return {
    threadKey: "environment-1:thread-1",
    title: "Thread",
    branch: "feat/one",
    worktreePath: "/worktrees/one",
    status: "ready",
    updatedAtMs: 1_000,
    ...overrides,
  };
}

describe("resolveMergeRunCandidates", () => {
  it("merges oldest activity first so long-lived branches land before newer ones", () => {
    const plan = resolveMergeRunCandidates([
      thread({ threadKey: "c", updatedAtMs: 3_000 }),
      thread({ threadKey: "a", updatedAtMs: 1_000 }),
      thread({ threadKey: "b", updatedAtMs: 2_000 }),
    ]);

    expect(plan.candidates.map((candidate) => candidate.threadKey)).toEqual(["a", "b", "c"]);
    expect(plan.skipped).toEqual([]);
  });

  it.each(["working", "approval", "input", "failed", "needs_resume"] as const)(
    "refuses to merge a thread that is %s",
    (status) => {
      const plan = resolveMergeRunCandidates([thread({ status })]);

      expect(plan.candidates).toEqual([]);
      expect(plan.skipped).toEqual([{ threadKey: "environment-1:thread-1", reason: "busy" }]);
    },
  );

  it("skips threads without a worktree rather than committing the shared checkout", () => {
    const plan = resolveMergeRunCandidates([
      thread({ threadKey: "local", worktreePath: null }),
      thread({ threadKey: "blank", worktreePath: "   " }),
      thread({ threadKey: "isolated" }),
    ]);

    expect(plan.candidates.map((candidate) => candidate.threadKey)).toEqual(["isolated"]);
    expect(plan.skipped).toEqual([
      { threadKey: "local", reason: "no_worktree" },
      { threadKey: "blank", reason: "no_worktree" },
    ]);
  });

  it("narrows the worktree path to a non-null string on candidates", () => {
    const plan = resolveMergeRunCandidates([thread({ worktreePath: "  /worktrees/one  " })]);

    expect(plan.candidates[0]?.worktreePath).toBe("/worktrees/one");
  });
});

describe("summarizeMergeRun", () => {
  it("reports a clean run", () => {
    expect(summarizeMergeRun({ merged: 3, total: 3, skippedBusy: 0, failedTitle: null })).toBe(
      "Merged 3 of 3 threads.",
    );
  });

  it("names the thread the run stopped on and the ones it left alone", () => {
    expect(
      summarizeMergeRun({ merged: 1, total: 3, skippedBusy: 2, failedTitle: "Fix Ctrl W" }),
    ).toBe('Merged 1 of 3 threads, stopped on "Fix Ctrl W", skipped 2 still in flight.');
  });

  it("does not claim a merge when nothing landed", () => {
    expect(summarizeMergeRun({ merged: 0, total: 1, skippedBusy: 0, failedTitle: "Only" })).toBe(
      'No threads merged, stopped on "Only".',
    );
  });
});
