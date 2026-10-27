// Avi Code addition: worktree cleanup as a background job. The scan, size
// measuring and delete all run here, outside React, so closing the review
// dialog never stops or loses them. The top bar pill
// (`WorktreeCleanupStatusPill`) and the single global `WorktreeCleanupDialog`
// both read this store.
//
// The scan skips disk sizes so the list arrives quickly; sizes are then
// measured two at a time and fill in as they return. Deleting never waits for
// them.

import type { VcsExecuteCleanupResult, VcsScanCleanupResult } from "@t3tools/contracts";
import { runAtomCommand, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { create } from "zustand";

import { stackedThreadToast, toastManager } from "./components/ui/toast";
import { readProject } from "./state/entities";
import { appAtomRegistry } from "./rpc/atomRegistry";
import { vcsEnvironment } from "./state/vcs";
import {
  describeRemoval,
  planDeleteSteps,
  preselectRows,
  unmeasuredRows,
  type CleanupFailure,
  type CleanupJobPhase,
  type CleanupSummary,
  type ScanGroup,
  type WorktreeCleanupTarget,
} from "./worktreeCleanupJob.logic";

export type { WorktreeCleanupTarget } from "./worktreeCleanupJob.logic";

/** One cleanup target per project ref that still resolves. */
export function cleanupTargetsForProjects(
  projectRefs: ReadonlyArray<Parameters<typeof readProject>[0]>,
): WorktreeCleanupTarget[] {
  return projectRefs.flatMap((ref) => {
    const project = readProject(ref);
    if (!project) return [];
    return [
      {
        environmentId: project.environmentId,
        projectId: project.id,
        cwd: project.workspaceRoot,
        title: project.title,
      },
    ];
  });
}

const SIZE_MEASURE_CONCURRENCY = 2;

export interface WorktreeCleanupJobState {
  readonly phase: CleanupJobPhase;
  readonly dialogOpen: boolean;
  readonly targets: ReadonlyArray<WorktreeCleanupTarget>;
  /** Finished projects, in target order. */
  readonly groups: ReadonlyArray<ScanGroup>;
  readonly selected: ReadonlySet<string>;
  /** Measured sizes by row key. Missing means not measured (yet). */
  readonly sizes: ReadonlyMap<string, number>;
  readonly measuringSizes: boolean;
  readonly projectsScanned: number;
  readonly projectsTotal: number;
  readonly deleteBranches: boolean;
  readonly pruneCheckpoints: boolean;
  readonly runGc: boolean;
  readonly deleteDone: number;
  readonly deleteTotal: number;
  readonly stopRequested: boolean;
  readonly summary: CleanupSummary | null;
}

const initialState: WorktreeCleanupJobState = {
  phase: "idle",
  dialogOpen: false,
  targets: [],
  groups: [],
  selected: new Set(),
  sizes: new Map(),
  measuringSizes: false,
  projectsScanned: 0,
  projectsTotal: 0,
  deleteBranches: true,
  pruneCheckpoints: true,
  runGc: true,
  deleteDone: 0,
  deleteTotal: 0,
  stopRequested: false,
  summary: null,
};

export const useWorktreeCleanupJob = create<WorktreeCleanupJobState>(() => initialState);

const setState = useWorktreeCleanupJob.setState;
const getState = useWorktreeCleanupJob.getState;

// Bumped whenever a job starts or is thrown away, so late results from an
// abandoned job are ignored.
let currentJobId = 0;
let finishToastId: ReturnType<typeof toastManager.add> | null = null;

function describeError(value: unknown): string {
  if (value instanceof Error) return value.message;
  if (typeof value === "string") return value;
  return "Unknown error.";
}

function closeFinishToast() {
  if (finishToastId !== null) {
    toastManager.close(finishToastId);
    finishToastId = null;
  }
}

/** Tell the user a background step finished, unless they are already looking. */
function notifyFinished(input: { title: string; description: string; review: boolean }) {
  if (getState().dialogOpen) return;
  closeFinishToast();
  finishToastId = toastManager.add(
    stackedThreadToast({
      type: "success",
      title: input.title,
      description: input.description,
      timeout: input.review ? 0 : 8000,
      ...(input.review
        ? {
            actionProps: {
              children: "Review",
              onClick: () => openWorktreeCleanupDialog(),
            },
            actionVariant: "default" as const,
          }
        : {}),
      data: {
        hideCopyButton: true,
        onClose: () => {
          finishToastId = null;
        },
      },
    }),
  );
}

export function openWorktreeCleanupDialog() {
  closeFinishToast();
  if (getState().phase === "idle") return;
  setState({ dialogOpen: true });
}

export function setWorktreeCleanupDialogOpen(open: boolean) {
  if (open) {
    openWorktreeCleanupDialog();
    return;
  }
  setState({ dialogOpen: false });
  // A finished delete, or a scan that found nothing, has nothing left to show.
  const { phase, groups } = getState();
  if (phase === "done" || (phase === "review" && countCandidates(groups) === 0)) {
    dismissWorktreeCleanupJob();
  }
}

/**
 * Start a background scan of `targets`. If a scan or delete is already
 * running, this only reopens its dialog.
 */
export function startWorktreeCleanupScan(targets: ReadonlyArray<WorktreeCleanupTarget>) {
  const { phase } = getState();
  if (phase === "scanning" || phase === "deleting") {
    openWorktreeCleanupDialog();
    return;
  }
  if (targets.length === 0) return;

  closeFinishToast();
  const jobId = ++currentJobId;
  const { deleteBranches, pruneCheckpoints, runGc } = getState();
  setState({
    ...initialState,
    deleteBranches,
    pruneCheckpoints,
    runGc,
    phase: "scanning",
    dialogOpen: true,
    targets,
    projectsTotal: targets.length,
  });
  void runScan(jobId, targets);
}

async function runScan(jobId: number, targets: ReadonlyArray<WorktreeCleanupTarget>) {
  const slots: Array<ScanGroup | null> = targets.map(() => null);

  await Promise.all(
    targets.map(async (target, index) => {
      const result = await runAtomCommand(
        appAtomRegistry,
        vcsEnvironment.scanCleanup,
        {
          environmentId: target.environmentId,
          input: { cwd: target.cwd, projectId: target.projectId, includeDiskBytes: false },
        },
        { reportFailure: false },
      );
      if (jobId !== currentJobId) return;

      const group: ScanGroup =
        result._tag === "Success"
          ? {
              target,
              candidates: (result.value as VcsScanCleanupResult).candidates,
              error: null,
            }
          : {
              target,
              candidates: [],
              error: describeError(squashAtomCommandFailure(result)),
            };
      slots[index] = group;

      // Show each project as soon as it is in, with today's default selection.
      setState((state) => {
        const selected = new Set(state.selected);
        for (const key of preselectRows([group])) selected.add(key);
        return {
          groups: slots.filter((slot): slot is ScanGroup => slot !== null),
          selected,
          projectsScanned: state.projectsScanned + 1,
        };
      });
    }),
  );
  if (jobId !== currentJobId) return;

  const total = countCandidates(getState().groups);
  const dialogWasOpen = getState().dialogOpen;
  setState({ phase: "review" });
  if (total === 0 && !dialogWasOpen) {
    // Nothing to review: the toast says so and the pill goes away.
    resetJob();
  }
  notifyFinished({
    title: "Worktree scan finished",
    description:
      total === 0
        ? "No dead worktrees found."
        : `Found ${total} dead ${total === 1 ? "worktree" : "worktrees"} to review.`,
    review: total > 0,
  });
  void measureSizes(jobId);
}

async function measureSizes(jobId: number) {
  const queue = unmeasuredRows(getState().groups, getState().sizes);
  if (queue.length === 0) return;
  setState({ measuringSizes: true });

  const worker = async () => {
    for (;;) {
      // Stop once the user moves on: deleting a folder while walking it only
      // wastes disk time.
      if (jobId !== currentJobId || getState().phase !== "review") return;
      const row = queue.shift();
      if (!row) return;
      const result = await runAtomCommand(
        appAtomRegistry,
        vcsEnvironment.measureWorktreeSize,
        {
          environmentId: row.target.environmentId,
          input: { cwd: row.target.cwd, worktreePath: row.worktreePath },
        },
        { reportFailure: false },
      );
      if (jobId !== currentJobId) return;
      if (result._tag === "Success") {
        const diskBytes = (result.value as { diskBytes: number }).diskBytes;
        setState((state) => {
          const sizes = new Map(state.sizes);
          sizes.set(row.key, diskBytes);
          return { sizes };
        });
      }
    }
  };

  await Promise.all(Array.from({ length: SIZE_MEASURE_CONCURRENCY }, worker));
  if (jobId === currentJobId) setState({ measuringSizes: false });
}

export function toggleWorktreeCleanupRow(key: string) {
  setState((state) => {
    const selected = new Set(state.selected);
    if (selected.has(key)) {
      selected.delete(key);
    } else {
      selected.add(key);
    }
    return { selected };
  });
}

export function setWorktreeCleanupOption(
  option: "deleteBranches" | "pruneCheckpoints" | "runGc",
  value: boolean,
) {
  setState({ [option]: value });
}

/** Delete the selected worktrees in the background, one at a time. */
export function startWorktreeCleanupDelete() {
  const state = getState();
  if (state.phase !== "review") return;
  const steps = planDeleteSteps(state.groups, state.selected, state.runGc);
  if (steps.length === 0) return;

  const jobId = currentJobId;
  setState({
    phase: "deleting",
    deleteDone: 0,
    deleteTotal: steps.length,
    stopRequested: false,
    measuringSizes: false,
  });
  void runDelete(jobId, steps, {
    deleteBranches: state.deleteBranches,
    pruneCheckpoints: state.pruneCheckpoints,
  });
}

async function runDelete(
  jobId: number,
  steps: ReturnType<typeof planDeleteSteps>,
  options: { deleteBranches: boolean; pruneCheckpoints: boolean },
) {
  const failures: CleanupFailure[] = [];
  let reclaimedBytes = 0;
  let successCount = 0;
  let bytesIncomplete = false;
  let stopped = false;

  for (const step of steps) {
    if (jobId !== currentJobId) return;
    if (getState().stopRequested) {
      stopped = true;
      break;
    }
    const knownSize = getState().sizes.get(step.key);
    const result = await runAtomCommand(
      appAtomRegistry,
      vcsEnvironment.executeCleanup,
      {
        environmentId: step.target.environmentId,
        input: {
          cwd: step.target.cwd,
          candidates: [
            {
              worktreePath: step.candidate.worktreePath,
              branch: step.candidate.branch,
              threadIds: step.candidate.threadIds,
              diskBytes: knownSize ?? 0,
            },
          ],
          deleteBranches: options.deleteBranches,
          pruneCheckpoints: options.pruneCheckpoints,
          runGc: step.runGc,
        },
      },
      { reportFailure: false },
    );
    if (jobId !== currentJobId) return;

    if (result._tag === "Success") {
      const value = result.value as VcsExecuteCleanupResult;
      for (const entry of value.results) {
        if (entry.ok) {
          successCount += 1;
          if (knownSize === undefined) bytesIncomplete = true;
        } else {
          failures.push({
            worktreePath: entry.worktreePath,
            error: entry.error ?? "Unknown error.",
          });
        }
      }
      reclaimedBytes += value.reclaimedBytes;
    } else {
      failures.push({
        worktreePath: step.candidate.worktreePath,
        error: describeError(squashAtomCommandFailure(result)),
      });
    }
    setState((state) => ({ deleteDone: state.deleteDone + 1 }));
  }

  const summary: CleanupSummary = {
    reclaimedBytes,
    successCount,
    failures,
    bytesIncomplete,
    stopped,
  };
  setState({ phase: "done", summary, stopRequested: false });
  notifyFinished({
    title: stopped ? "Worktree cleanup stopped" : "Worktree cleanup finished",
    description: `${describeRemoval(summary)}.${
      failures.length > 0 ? ` ${failures.length} could not be removed.` : ""
    }`,
    review: failures.length > 0,
  });
}

/**
 * The pill's ×. Scanning or reviewing: throw the job away (a server call
 * already in flight finishes and is ignored). Deleting: stop after the current
 * worktree. Done: clear it.
 */
export function cancelWorktreeCleanupJob() {
  const { phase } = getState();
  if (phase === "deleting") {
    setState({ stopRequested: true });
    return;
  }
  dismissWorktreeCleanupJob();
}

export function dismissWorktreeCleanupJob() {
  if (getState().phase === "deleting") return;
  closeFinishToast();
  resetJob();
}

// Back to idle, keeping the user's delete options for next time.
function resetJob() {
  currentJobId += 1;
  const { deleteBranches, pruneCheckpoints, runGc } = getState();
  setState({ ...initialState, deleteBranches, pruneCheckpoints, runGc });
}

function countCandidates(groups: ReadonlyArray<ScanGroup>): number {
  return groups.reduce((sum, group) => sum + group.candidates.length, 0);
}
