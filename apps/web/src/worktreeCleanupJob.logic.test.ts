import type { EnvironmentId, ThreadId, WorktreeCleanupCandidate } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  describeFreed,
  describeRemoval,
  pillLabel,
  planDeleteSteps,
  preselectRows,
  rowKey,
  selectionStats,
  unmeasuredRows,
  type ScanGroup,
  type WorktreeCleanupTarget,
} from "./worktreeCleanupJob.logic";

const target = (projectId: string): WorktreeCleanupTarget => ({
  environmentId: "env-1" as EnvironmentId,
  projectId,
  cwd: `/repo/${projectId}`,
  title: projectId,
});

const candidate = (
  worktreePath: string,
  flags: { isDirty?: boolean; isActive?: boolean } = {},
): WorktreeCleanupCandidate => ({
  worktreePath,
  branch: null,
  threadId: null,
  threadIds: [] as ThreadId[],
  reason: "archived",
  diskBytes: 0,
  isDirty: flags.isDirty ?? false,
  isActive: flags.isActive ?? false,
});

const projectA = target("a");
const projectB = target("b");
const groups: ScanGroup[] = [
  {
    target: projectA,
    candidates: [candidate("/wt/a1"), candidate("/wt/a2", { isDirty: true }), candidate("/wt/a3")],
    error: null,
  },
  {
    target: projectB,
    candidates: [candidate("/wt/b1", { isActive: true }), candidate("/wt/b2")],
    error: null,
  },
];
const key = (t: WorktreeCleanupTarget, path: string) => rowKey(t, { worktreePath: path });

describe("preselectRows", () => {
  it("checks rows that are neither dirty nor active", () => {
    expect([...preselectRows(groups)]).toEqual([
      key(projectA, "/wt/a1"),
      key(projectA, "/wt/a3"),
      key(projectB, "/wt/b2"),
    ]);
  });
});

describe("selectionStats", () => {
  it("sums measured sizes and counts the rows still measuring", () => {
    const selected = preselectRows(groups);
    const sizes = new Map([
      [key(projectA, "/wt/a1"), 100],
      [key(projectA, "/wt/a2"), 999],
    ]);
    expect(selectionStats(groups, selected, sizes)).toEqual({
      totalCandidates: 5,
      selectedCount: 3,
      selectedKnownBytes: 100,
      selectedUnmeasured: 2,
    });
  });
});

describe("planDeleteSteps", () => {
  it("runs git gc only on each project's last selected worktree", () => {
    const steps = planDeleteSteps(groups, preselectRows(groups), true);
    expect(steps.map((step) => [step.candidate.worktreePath, step.runGc])).toEqual([
      ["/wt/a1", false],
      ["/wt/a3", true],
      ["/wt/b2", true],
    ]);
  });

  it("never runs git gc when the option is off", () => {
    const steps = planDeleteSteps(groups, preselectRows(groups), false);
    expect(steps.every((step) => !step.runGc)).toBe(true);
  });
});

describe("unmeasuredRows", () => {
  it("lists rows without a size in list order", () => {
    const sizes = new Map([[key(projectA, "/wt/a2"), 5]]);
    expect(unmeasuredRows(groups, sizes).map((row) => row.worktreePath)).toEqual([
      "/wt/a1",
      "/wt/a3",
      "/wt/b1",
      "/wt/b2",
    ]);
  });
});

describe("describeFreed", () => {
  it("says at least when some sizes were unknown", () => {
    expect(describeFreed({ reclaimedBytes: 2048, bytesIncomplete: false })).toBe("2 KB");
    expect(describeFreed({ reclaimedBytes: 2048, bytesIncomplete: true })).toBe("at least 2 KB");
  });

  it("leaves the size out when nothing removed had been measured", () => {
    expect(describeFreed({ reclaimedBytes: 0, bytesIncomplete: true })).toBeNull();
    expect(describeRemoval({ reclaimedBytes: 0, bytesIncomplete: true, successCount: 1 })).toBe(
      "Removed 1 worktree",
    );
    expect(describeRemoval({ reclaimedBytes: 2048, bytesIncomplete: false, successCount: 2 })).toBe(
      "Removed 2 worktrees and freed 2 KB",
    );
  });
});

describe("pillLabel", () => {
  const base = {
    phase: "idle" as const,
    projectsScanned: 0,
    projectsTotal: 0,
    totalCandidates: 0,
    deleteDone: 0,
    deleteTotal: 0,
    summary: null,
  };

  it("hides while idle and counts progress otherwise", () => {
    expect(pillLabel(base)).toBeNull();
    expect(pillLabel({ ...base, phase: "scanning", projectsScanned: 3, projectsTotal: 7 })).toBe(
      "Scanning worktrees 3/7",
    );
    expect(pillLabel({ ...base, phase: "review", totalCandidates: 12 })).toBe(
      "12 dead worktrees · Review",
    );
    expect(pillLabel({ ...base, phase: "deleting", deleteDone: 7, deleteTotal: 40 })).toBe(
      "Deleting 7/40",
    );
    expect(
      pillLabel({
        ...base,
        phase: "done",
        summary: {
          reclaimedBytes: 1024 ** 3 * 8.2,
          successCount: 4,
          failures: [],
          bytesIncomplete: false,
          stopped: false,
        },
      }),
    ).toBe("Freed 8.2 GB");
  });
});
