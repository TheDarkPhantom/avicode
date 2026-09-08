import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  computeCleanupCandidates,
  isUnderWorktreesDir,
  normalizePathForCompare,
  type CleanupThreadInfo,
  type CleanupWorktreeInfo,
  type PrState,
} from "./WorktreeCleanup.ts";

const WORKTREES_DIR = "/home/u/.avicode/worktrees/repo";

function worktree(path: string, overrides: Partial<CleanupWorktreeInfo> = {}): CleanupWorktreeInfo {
  return { path, branch: "feature/x", isMain: false, ...overrides };
}

function thread(
  id: string,
  worktreePath: string | null,
  overrides: Partial<CleanupThreadInfo> = {},
): CleanupThreadInfo {
  return {
    threadId: ThreadId.make(id),
    worktreePath,
    branch: "feature/x",
    archivedAt: null,
    settledOverride: null,
    deletedAt: null,
    ...overrides,
  };
}

function run(input: {
  threads: ReadonlyArray<CleanupThreadInfo>;
  worktrees: ReadonlyArray<CleanupWorktreeInfo>;
  prStateByPath?: ReadonlyMap<string, PrState>;
  dirtyByPath?: ReadonlyMap<string, boolean>;
  diskBytesByPath?: ReadonlyMap<string, number>;
  activeThreadIds?: ReadonlySet<ThreadId>;
}) {
  return computeCleanupCandidates({
    threads: input.threads,
    worktrees: input.worktrees,
    worktreesDir: WORKTREES_DIR,
    prStateByPath: input.prStateByPath ?? new Map(),
    dirtyByPath: input.dirtyByPath ?? new Map(),
    diskBytesByPath: input.diskBytesByPath ?? new Map(),
    activeThreadIds: input.activeThreadIds ?? new Set(),
  });
}

describe("computeCleanupCandidates", () => {
  it("flags an archived thread's worktree", () => {
    const wtPath = `${WORKTREES_DIR}/a`;
    const candidates = run({
      threads: [thread("t1", wtPath, { archivedAt: "2026-01-01T00:00:00Z" })],
      worktrees: [worktree(wtPath)],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.reason).toBe("archived");
    expect(candidates[0]?.threadIds).toEqual([ThreadId.make("t1")]);
  });

  it("flags a settled thread's worktree", () => {
    const wtPath = `${WORKTREES_DIR}/b`;
    const candidates = run({
      threads: [thread("t1", wtPath, { settledOverride: "settled" })],
      worktrees: [worktree(wtPath)],
    });
    expect(candidates[0]?.reason).toBe("settled");
  });

  it("flags a worktree whose PR is merged even when the thread is otherwise live", () => {
    const wtPath = `${WORKTREES_DIR}/c`;
    const candidates = run({
      threads: [thread("t1", wtPath)],
      worktrees: [worktree(wtPath)],
      prStateByPath: new Map([[wtPath, "merged"]]),
    });
    expect(candidates[0]?.reason).toBe("pr-merged");
  });

  it("flags an orphaned worktree with no referencing thread", () => {
    const wtPath = `${WORKTREES_DIR}/d`;
    const candidates = run({ threads: [], worktrees: [worktree(wtPath)] });
    expect(candidates[0]?.reason).toBe("orphaned");
    expect(candidates[0]?.threadIds).toEqual([]);
  });

  it("treats a worktree referenced only by a deleted thread as orphaned", () => {
    const wtPath = `${WORKTREES_DIR}/e`;
    const candidates = run({
      threads: [thread("t1", wtPath, { deletedAt: "2026-01-01T00:00:00Z" })],
      worktrees: [worktree(wtPath)],
    });
    expect(candidates[0]?.reason).toBe("orphaned");
  });

  it("does NOT flag a shared worktree when any referencing thread is still live", () => {
    const wtPath = `${WORKTREES_DIR}/f`;
    const candidates = run({
      threads: [
        thread("t1", wtPath, { archivedAt: "2026-01-01T00:00:00Z" }),
        thread("t2", wtPath), // live
      ],
      worktrees: [worktree(wtPath)],
    });
    expect(candidates).toHaveLength(0);
  });

  it("flags a shared worktree only when every referencing thread is dead", () => {
    const wtPath = `${WORKTREES_DIR}/g`;
    const candidates = run({
      threads: [
        thread("t1", wtPath, { archivedAt: "2026-01-01T00:00:00Z" }),
        thread("t2", wtPath, { settledOverride: "settled" }),
      ],
      worktrees: [worktree(wtPath)],
    });
    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.threadIds).toHaveLength(2);
  });

  it("never flags the primary working tree", () => {
    const candidates = run({
      threads: [],
      worktrees: [worktree(`${WORKTREES_DIR}/main`, { isMain: true })],
    });
    expect(candidates).toHaveLength(0);
  });

  it("never flags a worktree outside the managed worktrees directory", () => {
    const outside = "/somewhere/else/wt";
    const candidates = run({
      threads: [thread("t1", outside, { archivedAt: "2026-01-01T00:00:00Z" })],
      worktrees: [worktree(outside)],
    });
    expect(candidates).toHaveLength(0);
  });

  it("surfaces dirty and disk metadata without changing candidacy", () => {
    const wtPath = `${WORKTREES_DIR}/h`;
    const candidates = run({
      threads: [thread("t1", wtPath, { archivedAt: "2026-01-01T00:00:00Z" })],
      worktrees: [worktree(wtPath)],
      dirtyByPath: new Map([[wtPath, true]]),
      diskBytesByPath: new Map([[wtPath, 4096]]),
    });
    expect(candidates[0]?.isDirty).toBe(true);
    expect(candidates[0]?.diskBytes).toBe(4096);
  });

  it("marks a candidate active when a referencing thread is in the active set", () => {
    const wtPath = `${WORKTREES_DIR}/i`;
    const candidates = run({
      threads: [thread("t1", wtPath, { archivedAt: "2026-01-01T00:00:00Z" })],
      worktrees: [worktree(wtPath)],
      activeThreadIds: new Set([ThreadId.make("t1")]),
    });
    expect(candidates[0]?.isActive).toBe(true);
  });
});

describe("path helpers", () => {
  it("normalizes separators, trailing slash, and case", () => {
    expect(normalizePathForCompare("C:\\A\\B\\")).toBe("c:/a/b");
  });

  it("isUnderWorktreesDir excludes the base itself and outside paths", () => {
    expect(isUnderWorktreesDir(WORKTREES_DIR, WORKTREES_DIR)).toBe(false);
    expect(isUnderWorktreesDir(`${WORKTREES_DIR}/x`, WORKTREES_DIR)).toBe(true);
    expect(isUnderWorktreesDir("/other/x", WORKTREES_DIR)).toBe(false);
  });
});
