// Avi Code addition: pure helpers for the background worktree cleanup job
// (`worktreeCleanupJob.ts`). Kept free of React and RPC so they test directly.

import type { EnvironmentId, WorktreeCleanupCandidate } from "@t3tools/contracts";

export interface WorktreeCleanupTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly cwd: string;
  readonly title: string;
}

export interface ScanGroup {
  readonly target: WorktreeCleanupTarget;
  readonly candidates: ReadonlyArray<WorktreeCleanupCandidate>;
  readonly error: string | null;
}

export interface CleanupFailure {
  readonly worktreePath: string;
  readonly error: string;
}

export interface CleanupSummary {
  readonly reclaimedBytes: number;
  readonly successCount: number;
  readonly failures: ReadonlyArray<CleanupFailure>;
  /** True when some removed worktrees had no measured size yet. */
  readonly bytesIncomplete: boolean;
  /** True when the user stopped the delete before it finished. */
  readonly stopped: boolean;
}

export type CleanupJobPhase = "idle" | "scanning" | "review" | "deleting" | "done";

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  const rounded = unitIndex === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unitIndex]}`;
}

export function rowKey(
  target: WorktreeCleanupTarget,
  candidate: Pick<WorktreeCleanupCandidate, "worktreePath">,
): string {
  return `${target.environmentId}:${target.projectId}:${candidate.worktreePath}`;
}

/** Rows checked by default: everything that is neither dirty nor in use. */
export function preselectRows(groups: ReadonlyArray<ScanGroup>): Set<string> {
  const selected = new Set<string>();
  for (const group of groups) {
    for (const candidate of group.candidates) {
      if (!candidate.isDirty && !candidate.isActive) {
        selected.add(rowKey(group.target, candidate));
      }
    }
  }
  return selected;
}

export interface SelectionStats {
  readonly totalCandidates: number;
  readonly selectedCount: number;
  /** Sum of measured sizes of selected rows. */
  readonly selectedKnownBytes: number;
  /** Selected rows whose size is still being measured. */
  readonly selectedUnmeasured: number;
}

export function selectionStats(
  groups: ReadonlyArray<ScanGroup>,
  selected: ReadonlySet<string>,
  sizes: ReadonlyMap<string, number>,
): SelectionStats {
  let totalCandidates = 0;
  let selectedCount = 0;
  let selectedKnownBytes = 0;
  let selectedUnmeasured = 0;
  for (const group of groups) {
    for (const candidate of group.candidates) {
      totalCandidates += 1;
      const key = rowKey(group.target, candidate);
      if (!selected.has(key)) continue;
      selectedCount += 1;
      const size = sizes.get(key);
      if (size === undefined) {
        selectedUnmeasured += 1;
      } else {
        selectedKnownBytes += size;
      }
    }
  }
  return { totalCandidates, selectedCount, selectedKnownBytes, selectedUnmeasured };
}

export interface DeleteStep {
  readonly key: string;
  readonly target: WorktreeCleanupTarget;
  readonly candidate: WorktreeCleanupCandidate;
  /** `git gc` runs once per project, on its last selected worktree. */
  readonly runGc: boolean;
}

/**
 * One step per selected worktree so progress can count them, grouped by
 * project. When `runGc` is on, only each project's last step carries it.
 */
export function planDeleteSteps(
  groups: ReadonlyArray<ScanGroup>,
  selected: ReadonlySet<string>,
  runGc: boolean,
): DeleteStep[] {
  const steps: DeleteStep[] = [];
  for (const group of groups) {
    const chosen = group.candidates.filter((candidate) =>
      selected.has(rowKey(group.target, candidate)),
    );
    chosen.forEach((candidate, index) => {
      steps.push({
        key: rowKey(group.target, candidate),
        target: group.target,
        candidate,
        runGc: runGc && index === chosen.length - 1,
      });
    });
  }
  return steps;
}

/** Candidates whose size has not been measured yet, in list order. */
export function unmeasuredRows(
  groups: ReadonlyArray<ScanGroup>,
  sizes: ReadonlyMap<string, number>,
): Array<{ key: string; target: WorktreeCleanupTarget; worktreePath: string }> {
  const rows: Array<{ key: string; target: WorktreeCleanupTarget; worktreePath: string }> = [];
  for (const group of groups) {
    for (const candidate of group.candidates) {
      const key = rowKey(group.target, candidate);
      if (!sizes.has(key)) {
        rows.push({ key, target: group.target, worktreePath: candidate.worktreePath });
      }
    }
  }
  return rows;
}

/** Freed space for display, or null when nothing measured was removed. */
export function describeFreed(
  summary: Pick<CleanupSummary, "reclaimedBytes" | "bytesIncomplete">,
): string | null {
  if (summary.bytesIncomplete && summary.reclaimedBytes === 0) return null;
  const amount = formatBytes(summary.reclaimedBytes);
  return summary.bytesIncomplete ? `at least ${amount}` : amount;
}

/** "Removed 3 worktrees and freed 2 GB", leaving out the size when unknown. */
export function describeRemoval(
  summary: Pick<CleanupSummary, "reclaimedBytes" | "bytesIncomplete" | "successCount">,
): string {
  const noun = summary.successCount === 1 ? "worktree" : "worktrees";
  const freed = describeFreed(summary);
  return freed === null
    ? `Removed ${summary.successCount} ${noun}`
    : `Removed ${summary.successCount} ${noun} and freed ${freed}`;
}

export interface PillStateInput {
  readonly phase: CleanupJobPhase;
  readonly projectsScanned: number;
  readonly projectsTotal: number;
  readonly totalCandidates: number;
  readonly deleteDone: number;
  readonly deleteTotal: number;
  readonly summary: CleanupSummary | null;
}

/** Text for the top bar status pill. Null hides the pill. */
export function pillLabel(input: PillStateInput): string | null {
  switch (input.phase) {
    case "idle":
      return null;
    case "scanning":
      return `Scanning worktrees ${input.projectsScanned}/${input.projectsTotal}`;
    case "review":
      return input.totalCandidates === 0
        ? "No dead worktrees"
        : `${input.totalCandidates} dead ${input.totalCandidates === 1 ? "worktree" : "worktrees"} · Review`;
    case "deleting":
      return `Deleting ${input.deleteDone}/${input.deleteTotal}`;
    case "done":
      if (input.summary === null) return "Cleanup finished";
      if (input.summary.successCount === 0) return "Cleanup finished";
      {
        const freed = describeFreed(input.summary);
        return freed === null
          ? `Removed ${input.summary.successCount} ${input.summary.successCount === 1 ? "worktree" : "worktrees"}`
          : `Freed ${freed}`;
      }
  }
}
