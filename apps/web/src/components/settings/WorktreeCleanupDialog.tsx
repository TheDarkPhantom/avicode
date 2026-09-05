"use client";

// Avi Code addition: shared dry-run preview for deleting dead worktrees. Nothing
// is removed until the user presses "Delete selected"; the scan is read-only and
// the execute call is the only mutating step.

import type {
  EnvironmentId,
  VcsExecuteCleanupResult,
  VcsScanCleanupResult,
  WorktreeCleanupCandidate,
} from "@t3tools/contracts";
import {
  AlertTriangleIcon,
  HardDriveIcon,
  GitBranchIcon,
  LoaderIcon,
  Trash2Icon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { useAtomCommand } from "../../state/use-atom-command";
import { vcsEnvironment } from "../../state/vcs";
import { formatWorktreePathForDisplay } from "../../worktreeCleanup";
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

export interface WorktreeCleanupTarget {
  readonly environmentId: EnvironmentId;
  readonly projectId: string;
  readonly cwd: string;
  readonly title: string;
}

interface WorktreeCleanupDialogProps {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly targets: ReadonlyArray<WorktreeCleanupTarget>;
}

interface ScanGroup {
  readonly target: WorktreeCleanupTarget;
  readonly candidates: ReadonlyArray<WorktreeCleanupCandidate>;
  readonly error: string | null;
}

interface CleanupSummary {
  readonly reclaimedBytes: number;
  readonly failures: ReadonlyArray<{ worktreePath: string; error: string }>;
  readonly successCount: number;
}

type ScanPhase = "idle" | "scanning" | "done";
type ExecutePhase = "idle" | "executing" | "done";

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

function rowKey(target: WorktreeCleanupTarget, candidate: WorktreeCleanupCandidate): string {
  return `${target.environmentId}:${target.projectId}:${candidate.worktreePath}`;
}

function describeError(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }
  return "Unknown error.";
}

export function WorktreeCleanupDialog({
  open,
  onOpenChange,
  targets,
}: WorktreeCleanupDialogProps) {
  const scanCleanup = useAtomCommand(vcsEnvironment.scanCleanup, { reportFailure: false });
  const executeCleanup = useAtomCommand(vcsEnvironment.executeCleanup, { reportFailure: false });

  const [scanPhase, setScanPhase] = useState<ScanPhase>("idle");
  const [groups, setGroups] = useState<ReadonlyArray<ScanGroup>>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [deleteBranches, setDeleteBranches] = useState(true);
  const [pruneCheckpoints, setPruneCheckpoints] = useState(true);
  const [runGc, setRunGc] = useState(true);
  const [executePhase, setExecutePhase] = useState<ExecutePhase>("idle");
  const [summary, setSummary] = useState<CleanupSummary | null>(null);

  const runScan = useCallback(async () => {
    setScanPhase("scanning");
    setSummary(null);
    setExecutePhase("idle");

    const results = await Promise.all(
      targets.map(async (target): Promise<ScanGroup> => {
        const result = await scanCleanup({
          environmentId: target.environmentId,
          input: { cwd: target.cwd, projectId: target.projectId },
        });
        if (result._tag === "Success") {
          const value = result.value as VcsScanCleanupResult;
          return { target, candidates: value.candidates, error: null };
        }
        return {
          target,
          candidates: [],
          error: describeError(squashAtomCommandFailure(result)),
        };
      }),
    );

    const nextSelected = new Set<string>();
    for (const group of results) {
      for (const candidate of group.candidates) {
        if (!candidate.isDirty && !candidate.isActive) {
          nextSelected.add(rowKey(group.target, candidate));
        }
      }
    }

    setGroups(results);
    setSelected(nextSelected);
    setScanPhase("done");
  }, [scanCleanup, targets]);

  // Kick off a fresh scan whenever the dialog opens, and reset everything when
  // it closes so a reopen never shows stale candidates.
  useEffect(() => {
    if (!open) {
      setScanPhase("idle");
      setGroups([]);
      setSelected(new Set());
      setSummary(null);
      setExecutePhase("idle");
      return;
    }
    void runScan();
  }, [open, runScan]);

  const toggleRow = useCallback((key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const { selectedCount, selectedBytes, totalCandidates } = useMemo(() => {
    let count = 0;
    let bytes = 0;
    let total = 0;
    for (const group of groups) {
      for (const candidate of group.candidates) {
        total += 1;
        if (selected.has(rowKey(group.target, candidate))) {
          count += 1;
          bytes += candidate.diskBytes;
        }
      }
    }
    return { selectedCount: count, selectedBytes: bytes, totalCandidates: total };
  }, [groups, selected]);

  const handleExecute = useCallback(async () => {
    setExecutePhase("executing");

    const failures: Array<{ worktreePath: string; error: string }> = [];
    let reclaimedBytes = 0;
    let successCount = 0;

    for (const group of groups) {
      const chosen = group.candidates.filter((candidate) =>
        selected.has(rowKey(group.target, candidate)),
      );
      if (chosen.length === 0) {
        continue;
      }

      const result = await executeCleanup({
        environmentId: group.target.environmentId,
        input: {
          cwd: group.target.cwd,
          candidates: chosen.map((candidate) => ({
            worktreePath: candidate.worktreePath,
            branch: candidate.branch,
            threadIds: candidate.threadIds,
            diskBytes: candidate.diskBytes,
          })),
          deleteBranches,
          pruneCheckpoints,
          runGc,
        },
      });

      if (result._tag === "Success") {
        const value = result.value as VcsExecuteCleanupResult;
        reclaimedBytes += value.reclaimedBytes;
        for (const entry of value.results) {
          if (entry.ok) {
            successCount += 1;
          } else {
            failures.push({
              worktreePath: entry.worktreePath,
              error: entry.error ?? "Unknown error.",
            });
          }
        }
      } else {
        const message = describeError(squashAtomCommandFailure(result));
        for (const candidate of chosen) {
          failures.push({ worktreePath: candidate.worktreePath, error: message });
        }
      }
    }

    setSummary({ reclaimedBytes, failures, successCount });
    setExecutePhase("done");
  }, [deleteBranches, executeCleanup, groups, pruneCheckpoints, runGc, selected]);

  const isBusy = scanPhase === "scanning" || executePhase === "executing";
  const canDelete =
    scanPhase === "done" && executePhase !== "executing" && summary === null && selectedCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Clean up dead worktrees</DialogTitle>
          <DialogDescription>
            Review the worktrees that look safe to remove. Nothing is deleted until you press Delete
            selected.
          </DialogDescription>
        </DialogHeader>

        <DialogPanel className="space-y-4">
          {scanPhase === "scanning" ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
              <LoaderIcon className="size-4 animate-spin" />
              Scanning for dead worktrees...
            </div>
          ) : null}

          {scanPhase === "done" && totalCandidates === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No dead worktrees found.
            </div>
          ) : null}

          {scanPhase === "done" && totalCandidates > 0 && summary === null ? (
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
                          const isChecked = selected.has(key);
                          const warnDirty = candidate.isDirty;
                          const warnActive = candidate.isActive;
                          return (
                            <li key={key} className="flex items-start gap-3 px-3 py-2.5">
                              <Checkbox
                                className="mt-0.5"
                                checked={isChecked}
                                onCheckedChange={() => toggleRow(key)}
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
                                    {formatBytes(candidate.diskBytes)}
                                  </span>
                                </div>
                                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                  {candidate.branch !== null ? (
                                    <span className="inline-flex items-center gap-1">
                                      <GitBranchIcon className="size-3" />
                                      <span className="truncate">{candidate.branch}</span>
                                    </span>
                                  ) : null}
                                  {warnDirty ? (
                                    <span className="inline-flex items-center gap-1 text-warning-foreground">
                                      <AlertTriangleIcon className="size-3" />
                                      Uncommitted changes
                                    </span>
                                  ) : null}
                                  {warnActive ? (
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
                  checked={deleteBranches}
                  onChange={setDeleteBranches}
                />
                <CleanupOption
                  label="Prune checkpoints"
                  checked={pruneCheckpoints}
                  onChange={setPruneCheckpoints}
                />
                <CleanupOption label="Run git gc" checked={runGc} onChange={setRunGc} />
              </div>
            </div>
          ) : null}

          {summary !== null ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-foreground">
                Removed {summary.successCount}{" "}
                {summary.successCount === 1 ? "worktree" : "worktrees"} and reclaimed{" "}
                {formatBytes(summary.reclaimedBytes)}.
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
            {scanPhase === "done" && summary === null && totalCandidates > 0
              ? `${selectedCount} selected · ${formatBytes(selectedBytes)}`
              : null}
          </div>
          {summary === null ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => void handleExecute()}
                disabled={!canDelete}
              >
                {executePhase === "executing" ? (
                  <LoaderIcon className="size-4 animate-spin" />
                ) : (
                  <Trash2Icon className="size-4" />
                )}
                {executePhase === "executing" ? "Deleting..." : "Delete selected"}
              </Button>
            </>
          ) : (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
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
