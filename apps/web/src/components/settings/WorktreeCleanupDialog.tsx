"use client";

// Avi Code addition: review screen for the background worktree cleanup job
// (`worktreeCleanupJob.ts`). Mounted once in the root route. Closing it only
// hides it: the scan, size measuring and delete keep running, and the top bar
// pill reopens it. Nothing is removed until the user presses "Delete selected".

import type { WorktreeCleanupCandidate } from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  HardDriveIcon,
  GitBranchIcon,
  LoaderIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo } from "react";

import { formatWorktreePathForDisplay } from "../../worktreeCleanup";
import {
  cancelWorktreeCleanupJob,
  setWorktreeCleanupDialogOpen,
  setWorktreeCleanupOption,
  startWorktreeCleanupDelete,
  toggleWorktreeCleanupRow,
  useWorktreeCleanupJob,
} from "../../worktreeCleanupJob";
import {
  describeRemoval,
  formatBytes,
  rowKey,
  selectionStats,
} from "../../worktreeCleanupJob.logic";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";

const REASON_LABELS: Record<WorktreeCleanupCandidate["reason"], string> = {
  archived: "Archived",
  settled: "Settled",
  "pr-merged": "PR merged",
  "pr-closed": "PR closed",
  orphaned: "Orphaned",
};

const REASON_VARIANTS: Record<
  WorktreeCleanupCandidate["reason"],
  "secondary" | "success" | "warning" | "outline"
> = {
  archived: "secondary",
  settled: "secondary",
  "pr-merged": "success",
  "pr-closed": "warning",
  orphaned: "outline",
};

export function WorktreeCleanupDialog() {
  const job = useWorktreeCleanupJob();
  const { phase, groups, selected, sizes, summary } = job;

  const stats = useMemo(() => selectionStats(groups, selected, sizes), [groups, selected, sizes]);

  const isScanning = phase === "scanning";
  const isDeleting = phase === "deleting";
  const showList = (phase === "scanning" || phase === "review") && stats.totalCandidates > 0;
  const canDelete = phase === "review" && stats.selectedCount > 0;
  const hide = () => setWorktreeCleanupDialogOpen(false);

  return (
    <Dialog open={job.dialogOpen && phase !== "idle"} onOpenChange={setWorktreeCleanupDialogOpen}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clean up dead worktrees</DialogTitle>
          <DialogDescription>
            Review the worktrees that look safe to remove. Nothing is deleted until you press Delete
            selected. You can close this window; the work keeps going and the top bar shows its
            progress.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {isScanning ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Scanning projects ({job.projectsScanned} of {job.projectsTotal} done)...
            </div>
          ) : null}

          {phase === "review" && stats.totalCandidates === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No dead worktrees found.
            </div>
          ) : null}

          {showList ? (
            <div className="space-y-4">
              {groups.map((group) =>
                group.error === null && group.candidates.length === 0 ? null : (
                  <div key={`${group.target.environmentId}:${group.target.projectId}`}>
                    <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                      <h3 className="truncate text-sm font-medium text-foreground">
                        {group.target.title}
                      </h3>
                      {group.error !== null ? (
                        <span className="text-xs text-destructive-foreground">Scan failed</span>
                      ) : null}
                    </div>

                    {group.error !== null ? (
                      <p className="px-1 text-xs text-muted-foreground">{group.error}</p>
                    ) : (
                      <ul className="divide-y divide-border/60 overflow-hidden rounded-lg border border-border/60">
                        {group.candidates.map((candidate) => {
                          const key = rowKey(group.target, candidate);
                          const size = sizes.get(key);
                          return (
                            <li key={key} className="flex items-start gap-3 px-3 py-2.5">
                              <Checkbox
                                className="mt-0.5"
                                checked={selected.has(key)}
                                onCheckedChange={() => toggleWorktreeCleanupRow(key)}
                                aria-label={`Select ${formatWorktreePathForDisplay(candidate.worktreePath)}`}
                              />
                              <div className="min-w-0 flex-1 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge variant={REASON_VARIANTS[candidate.reason]} size="sm">
                                    {REASON_LABELS[candidate.reason]}
                                  </Badge>
                                  <span className="truncate font-medium text-foreground">
                                    {formatWorktreePathForDisplay(candidate.worktreePath)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                    <HardDriveIcon className="size-3" />
                                    {size !== undefined
                                      ? formatBytes(size)
                                      : job.measuringSizes || isScanning
                                        ? "measuring..."
                                        : "size unknown"}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {candidate.branch !== null ? (
                                    <span className="inline-flex items-center gap-1">
                                      <GitBranchIcon className="size-3" />
                                      <span className="truncate">{candidate.branch}</span>
                                    </span>
                                  ) : null}
                                  {candidate.isDirty ? (
                                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                                      <AlertTriangleIcon className="size-3" />
                                      Uncommitted changes
                                    </span>
                                  ) : null}
                                  {candidate.isActive ? (
                                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                                      <AlertTriangleIcon className="size-3" />
                                      Active
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                ),
              )}

              <div className="space-y-2 rounded-lg border border-border/60 p-3">
                <CleanupOption
                  label="Delete branches"
                  checked={job.deleteBranches}
                  onChange={(value) => setWorktreeCleanupOption("deleteBranches", value)}
                />
                <CleanupOption
                  label="Prune checkpoints"
                  checked={job.pruneCheckpoints}
                  onChange={(value) => setWorktreeCleanupOption("pruneCheckpoints", value)}
                />
                <CleanupOption
                  label="Run git gc"
                  checked={job.runGc}
                  onChange={(value) => setWorktreeCleanupOption("runGc", value)}
                />
              </div>
            </div>
          ) : null}

          {isDeleting ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              {job.stopRequested
                ? "Stopping after the current worktree..."
                : `Deleting worktree ${Math.min(job.deleteDone + 1, job.deleteTotal)} of ${job.deleteTotal}...`}
            </div>
          ) : null}

          {phase === "done" && summary !== null ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground">
                {summary.stopped ? "Stopped early. " : ""}
                {describeRemoval(summary)}.
              </p>
              {summary.failures.length > 0 ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium text-destructive-foreground">
                    {summary.failures.length}{" "}
                    {summary.failures.length === 1 ? "failure" : "failures"}:
                  </p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {summary.failures.map((failure) => (
                      <li key={failure.worktreePath}>
                        <span className="font-medium text-foreground">
                          {formatWorktreePathForDisplay(failure.worktreePath)}
                        </span>
                        : {failure.error}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogPanel>

        <DialogFooter>
          <div className="mr-auto flex items-center text-sm text-muted-foreground">
            {showList
              ? `${stats.selectedCount} selected · ${formatBytes(stats.selectedKnownBytes)}${
                  stats.selectedUnmeasured > 0
                    ? ` (${stats.selectedUnmeasured} still measuring)`
                    : ""
                }`
              : null}
          </div>
          {phase === "done" ? (
            <Button onClick={hide}>Close</Button>
          ) : isDeleting ? (
            <>
              <Button
                variant="outline"
                onClick={cancelWorktreeCleanupJob}
                disabled={job.stopRequested}
              >
                Stop
              </Button>
              <Button onClick={hide}>Hide</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={isScanning ? hide : cancelWorktreeCleanupJob}>
                {isScanning ? "Hide" : "Cancel"}
              </Button>
              <Button
                variant="destructive"
                onClick={startWorktreeCleanupDelete}
                disabled={!canDelete}
              >
                <Trash2Icon className="size-4" />
                Delete selected
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

function CleanupOption({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
      {label}
    </label>
  );
}
