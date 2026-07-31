import type { SidebarV2Status } from "../Sidebar.logic";

/**
 * Avi Code addition. Pure selection and copy for the project-level merge run:
 * one pass over a project's threads that merges each ready worktree branch in
 * turn. Upstream has no batch merge at all — every thread is merged by hand
 * from its own chat header.
 *
 * The walk is deliberately sequential. `GitWorkflowService.runStackedAction`
 * already takes a per-repository lock so concurrent merges cannot interleave
 * their git phases, but nothing rebases a branch that went stale while an
 * earlier merge landed. Running one at a time and stopping on the first
 * failure keeps the user in front of the conflict instead of behind a pile of
 * them.
 */

export interface MergeRunThreadInput {
  readonly threadKey: string;
  readonly title: string;
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly status: SidebarV2Status;
  /** Last activity, already parsed. Oldest branches merge first. */
  readonly updatedAtMs: number;
}

export interface MergeRunCandidate extends MergeRunThreadInput {
  readonly worktreePath: string;
}

export type MergeRunSkipReason = "no_worktree" | "busy";

export interface MergeRunPlan {
  readonly candidates: ReadonlyArray<MergeRunCandidate>;
  readonly skipped: ReadonlyArray<{
    readonly threadKey: string;
    readonly reason: MergeRunSkipReason;
  }>;
}

/**
 * Only "ready" threads qualify. Every other status means the agent is still
 * mid-turn, blocked on the user, or ended badly, and merging any of those
 * lands a half-finished branch.
 */
export function isMergeRunReadyStatus(status: SidebarV2Status): boolean {
  return status === "ready";
}

export function resolveMergeRunCandidates(
  threads: ReadonlyArray<MergeRunThreadInput>,
): MergeRunPlan {
  const candidates: MergeRunCandidate[] = [];
  const skipped: { threadKey: string; reason: MergeRunSkipReason }[] = [];

  for (const thread of threads) {
    const worktreePath = thread.worktreePath?.trim();
    if (!worktreePath) {
      // A thread working directly in the project checkout shares its working
      // tree with every other local thread, so committing on its behalf would
      // sweep up unrelated changes.
      skipped.push({ threadKey: thread.threadKey, reason: "no_worktree" });
      continue;
    }
    if (!isMergeRunReadyStatus(thread.status)) {
      skipped.push({ threadKey: thread.threadKey, reason: "busy" });
      continue;
    }
    candidates.push({ ...thread, worktreePath });
  }

  return {
    candidates: candidates.sort((a, b) => a.updatedAtMs - b.updatedAtMs),
    skipped,
  };
}

export function summarizeMergeRun(input: {
  readonly merged: number;
  readonly total: number;
  readonly skippedBusy: number;
  readonly failedTitle: string | null;
}): string {
  const mergedClause =
    input.merged === 0
      ? "No threads merged"
      : `Merged ${input.merged} of ${input.total} ${input.total === 1 ? "thread" : "threads"}`;
  const stopClause = input.failedTitle ? `, stopped on "${input.failedTitle}"` : "";
  const busyClause = input.skippedBusy > 0 ? `, skipped ${input.skippedBusy} still in flight` : "";
  return `${mergedClause}${stopClause}${busyClause}.`;
}
