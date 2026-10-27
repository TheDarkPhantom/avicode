// Avi Code addition: top bar status for the background worktree cleanup job.
// Hidden while idle. Click reopens the review dialog; × cancels a running scan,
// stops a running delete after the current worktree, or clears a finished job.

import { HardDriveIcon, LoaderIcon, XIcon } from "lucide-react";
import { useShallow } from "zustand/react/shallow";

import { cn } from "~/lib/utils";
import {
  cancelWorktreeCleanupJob,
  openWorktreeCleanupDialog,
  useWorktreeCleanupJob,
} from "../worktreeCleanupJob";
import { pillLabel } from "../worktreeCleanupJob.logic";

export function WorktreeCleanupStatusPill({ className }: { readonly className?: string }) {
  const state = useWorktreeCleanupJob(
    useShallow((job) => ({
      phase: job.phase,
      projectsScanned: job.projectsScanned,
      projectsTotal: job.projectsTotal,
      totalCandidates: job.groups.reduce((sum, group) => sum + group.candidates.length, 0),
      deleteDone: job.deleteDone,
      deleteTotal: job.deleteTotal,
      stopRequested: job.stopRequested,
      summary: job.summary,
    })),
  );
  const label = pillLabel(state);
  if (label === null) return null;

  const busy = state.phase === "scanning" || state.phase === "deleting";
  const cancelLabel =
    state.phase === "scanning"
      ? "Cancel worktree scan"
      : state.phase === "deleting"
        ? "Stop deleting worktrees"
        : "Dismiss";

  return (
    <div
      role="status"
      className={cn(
        "flex h-7 shrink-0 items-center rounded-full border border-border/60 bg-card/95 text-xs font-medium text-foreground shadow-xs [-webkit-app-region:no-drag]",
        className,
      )}
    >
      <button
        type="button"
        onClick={openWorktreeCleanupDialog}
        title="Open worktree cleanup"
        className="flex h-full min-w-0 items-center gap-1.5 rounded-l-full pl-2.5 pr-1.5 hover:bg-accent/60"
      >
        {busy ? (
          <LoaderIcon
            aria-hidden
            className="size-3.5 shrink-0 animate-spin text-muted-foreground"
          />
        ) : (
          <HardDriveIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{state.stopRequested ? "Stopping..." : label}</span>
      </button>
      <button
        type="button"
        onClick={cancelWorktreeCleanupJob}
        disabled={state.stopRequested}
        aria-label={cancelLabel}
        title={cancelLabel}
        className="flex h-full items-center rounded-r-full pl-1 pr-2 text-muted-foreground hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
      >
        <XIcon aria-hidden className="size-3" />
      </button>
    </div>
  );
}
