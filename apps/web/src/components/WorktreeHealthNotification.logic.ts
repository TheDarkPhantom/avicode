// Avi Code addition: pure decisions for the worktree-health warning toast, kept
// separate from the React component so they can be unit-tested.
import type { WorktreeHealthSnapshot } from "@t3tools/contracts";

import type { WorktreeHealthDismissal } from "../worktreeHealthDismissal";
import { formatBytes } from "./settings/WorktreeCleanupDialog";

const DAY_MS = 24 * 60 * 60 * 1000;
const FREE_SPACE_WORSENED_BYTES = 1024 * 1024 * 1024; // 1 GiB

/**
 * Show a warning when the snapshot is breached and the user has not already
 * dismissed this (or a milder) state. It re-appears when: never dismissed, a day
 * has passed, more clean-dead worktrees have piled up, or free space has fallen
 * by more than a gigabyte since the dismissal.
 */
export function shouldShowWorktreeHealthToast(input: {
  readonly snapshot: WorktreeHealthSnapshot | null;
  readonly dismissal: WorktreeHealthDismissal | null;
  readonly nowMs: number;
}): boolean {
  const { snapshot, dismissal, nowMs } = input;
  if (snapshot === null || !snapshot.breached) {
    return false;
  }
  if (dismissal === null) {
    return true;
  }

  const dismissedAtMs = Date.parse(dismissal.dismissedAt);
  if (Number.isNaN(dismissedAtMs) || nowMs - dismissedAtMs >= DAY_MS) {
    return true;
  }
  if (snapshot.deadCleanCount > dismissal.deadCleanCount) {
    return true;
  }
  if (
    snapshot.freeBytes !== null &&
    dismissal.freeBytes !== null &&
    snapshot.freeBytes < dismissal.freeBytes - FREE_SPACE_WORSENED_BYTES
  ) {
    return true;
  }
  return false;
}

export interface WorktreeHealthToastCopy {
  readonly title: string;
  readonly description: string;
}

export function worktreeHealthToastCopy(snapshot: WorktreeHealthSnapshot): WorktreeHealthToastCopy {
  const parts: string[] = [];

  if (snapshot.breachReasons.includes("dead-count")) {
    parts.push(`${snapshot.deadCleanCount} dead worktrees are taking up space`);
  }
  if (snapshot.breachReasons.includes("low-disk") && snapshot.freeBytes !== null) {
    parts.push(`only ${formatBytes(snapshot.freeBytes)} of disk is free`);
  }
  const title = parts.length > 0 ? capitalize(joinWithAnd(parts)) : "Worktrees need attention";

  const sentences: string[] = [];
  if (snapshot.autoCleanup !== null && snapshot.autoCleanup.removedCount > 0) {
    sentences.push(
      `Removed ${snapshot.autoCleanup.removedCount} and reclaimed ${formatBytes(
        snapshot.autoCleanup.freedBytes,
      )} automatically.`,
    );
  }
  if (snapshot.deadDirtyCount > 0) {
    sentences.push(
      `${snapshot.deadDirtyCount} with uncommitted changes need your review before removal.`,
    );
  }
  if (sentences.length === 0) {
    sentences.push("Review and clean up dead worktrees to reclaim disk space.");
  }

  return { title: `${title}.`, description: sentences.join(" ") };
}

function capitalize(value: string): string {
  return value.length === 0 ? value : value[0]!.toUpperCase() + value.slice(1);
}

function joinWithAnd(parts: ReadonlyArray<string>): string {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
