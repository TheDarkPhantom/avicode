// @effect-diagnostics nodeBuiltinImport:off
/**
 * WorktreeHealthMonitor - background watch for dead-worktree pressure and low disk.
 *
 * Avi Code addition. Chat worktrees each carry a full `node_modules`, so a long
 * session can pile up hundreds and fill the disk (the motivating incident: 151
 * dead worktrees, 0 bytes free). The manual cleanup dialog only runs when a user
 * opens Settings and scans. This monitor runs on its own: ~2 min after start and
 * then hourly, it classifies dead worktrees per project (reusing
 * `WorktreeCleanupService.classify`, which skips the slow on-disk size walk) and
 * reads free space on the volume holding the managed worktrees directory. If the
 * clean-dead count crosses the threshold or free space drops below the low-disk
 * mark, and auto-cleanup is enabled, it removes the clean, inactive dead worktree
 * *directories only* (never branches or checkpoints) and re-measures. Every check
 * publishes a snapshot that clients render as a warning with a "Clean up" action.
 *
 * The threshold/breach evaluation and candidate selection are pure functions,
 * unit-tested without Effect.
 *
 * @module WorktreeHealthMonitor
 */
import {
  type GitCommandError,
  type WorktreeCleanupCandidate,
  type WorktreeHealthBreachReason,
  type WorktreeHealthProjectSummary,
  type WorktreeHealthSnapshot,
  type WorktreeHealthThresholds,
  type WorktreeHealthTrigger,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import * as NodeFS from "node:fs";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import type * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import { BackgroundPolicy } from "../background/BackgroundPolicy.ts";
import { ServerConfig } from "../config.ts";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { WorktreeCleanupService } from "./WorktreeCleanup.ts";

const DEFAULT_STARTUP_DELAY_MS = 2 * 60 * 1000;
const DEFAULT_INTERVAL_MS = 60 * 60 * 1000;
const BYTES_PER_GB = 1024 * 1024 * 1024;

/** Reasons a worktree is safe to auto-remove. "pr-closed" stays manual-only. */
const AUTO_CLEANUP_REASONS: ReadonlySet<WorktreeCleanupCandidate["reason"]> = new Set([
  "archived",
  "settled",
  "orphaned",
  "pr-merged",
]);

export interface DiskUsage {
  readonly freeBytes: number | null;
  readonly totalBytes: number | null;
}

export interface WorktreeHealthMonitorShape {
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;
  readonly runCheck: (input: {
    readonly trigger: WorktreeHealthTrigger;
  }) => Effect.Effect<WorktreeHealthSnapshot, GitCommandError>;
  /** Latest snapshot, or null before the first check has run. */
  readonly current: Effect.Effect<WorktreeHealthSnapshot | null>;
  readonly streamChanges: Stream.Stream<WorktreeHealthSnapshot>;
}

export class WorktreeHealthMonitor extends Context.Service<
  WorktreeHealthMonitor,
  WorktreeHealthMonitorShape
>()("t3/git/WorktreeHealthMonitor") {}

/**
 * Pure breach evaluation. Breached when the clean-dead count reaches the
 * threshold, or (disk rule enabled) free space is under the low-disk mark.
 */
export function evaluateWorktreeHealth(input: {
  readonly deadCleanCount: number;
  readonly freeBytes: number | null;
  readonly thresholds: WorktreeHealthThresholds;
}): {
  readonly breached: boolean;
  readonly breachReasons: ReadonlyArray<WorktreeHealthBreachReason>;
} {
  const breachReasons: WorktreeHealthBreachReason[] = [];
  if (input.deadCleanCount >= input.thresholds.deadCountThreshold) {
    breachReasons.push("dead-count");
  }
  if (
    input.thresholds.lowDiskGb > 0 &&
    input.freeBytes !== null &&
    input.freeBytes < input.thresholds.lowDiskGb * BYTES_PER_GB
  ) {
    breachReasons.push("low-disk");
  }
  return { breached: breachReasons.length > 0, breachReasons };
}

/** Candidates safe to remove without asking: not dirty, not active, auto reason. */
export function selectAutoCleanupCandidates(
  candidates: ReadonlyArray<WorktreeCleanupCandidate>,
): ReadonlyArray<WorktreeCleanupCandidate> {
  return candidates.filter(
    (candidate) =>
      !candidate.isDirty && !candidate.isActive && AUTO_CLEANUP_REASONS.has(candidate.reason),
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

const defaultMeasureDisk = (dir: string): Effect.Effect<DiskUsage> =>
  Effect.tryPromise(() => NodeFS.promises.statfs(dir)).pipe(
    Effect.map((stats) => ({
      freeBytes: Math.round(Number(stats.bavail) * Number(stats.bsize)),
      totalBytes: Math.round(Number(stats.blocks) * Number(stats.bsize)),
    })),
    Effect.orElseSucceed(() => ({ freeBytes: null, totalBytes: null }) satisfies DiskUsage),
  );

export interface WorktreeHealthMonitorOptions {
  readonly startupDelayMs?: number;
  readonly intervalMs?: number;
  readonly measureDisk?: (dir: string) => Effect.Effect<DiskUsage>;
}

interface ProjectClassification {
  readonly projectId: string;
  readonly cwd: string;
  readonly candidates: ReadonlyArray<WorktreeCleanupCandidate>;
  readonly error: string | null;
}

export const makeWorktreeHealthMonitor = (options?: WorktreeHealthMonitorOptions) =>
  Effect.gen(function* () {
    const cleanup = yield* WorktreeCleanupService;
    const projectRepository = yield* ProjectionProjectRepository;
    const serverSettings = yield* ServerSettingsService;
    const backgroundPolicy = yield* BackgroundPolicy;
    const { worktreesDir } = yield* ServerConfig;

    const startupDelayMs = Math.max(0, options?.startupDelayMs ?? DEFAULT_STARTUP_DELAY_MS);
    const intervalMs = Math.max(1, options?.intervalMs ?? DEFAULT_INTERVAL_MS);
    const measureDisk = options?.measureDisk ?? defaultMeasureDisk;

    const snapshotRef = yield* Ref.make<WorktreeHealthSnapshot | null>(null);
    const changes = yield* PubSub.unbounded<WorktreeHealthSnapshot>();
    // Serialize the timer, the startup run, and the manual RPC so they never
    // classify or delete concurrently.
    const runMutex = yield* Semaphore.make(1);

    const publish = (snapshot: WorktreeHealthSnapshot) =>
      Ref.set(snapshotRef, snapshot).pipe(Effect.andThen(PubSub.publish(changes, snapshot)));

    const classifyProjects = (): Effect.Effect<
      ReadonlyArray<ProjectClassification>,
      GitCommandError
    > =>
      Effect.gen(function* () {
        const projects = (yield* projectRepository
          .listAll()
          .pipe(Effect.orElseSucceed(() => []))).filter((project) => project.deletedAt === null);
        return yield* Effect.forEach(
          projects,
          (project) =>
            cleanup.classify({ cwd: project.workspaceRoot, projectId: project.projectId }).pipe(
              Effect.map(
                (candidates): ProjectClassification => ({
                  projectId: project.projectId,
                  cwd: project.workspaceRoot,
                  candidates,
                  error: null,
                }),
              ),
              Effect.catch((error: GitCommandError) =>
                Effect.succeed<ProjectClassification>({
                  projectId: project.projectId,
                  cwd: project.workspaceRoot,
                  candidates: [],
                  error: describeError(error),
                }),
              ),
            ),
          { concurrency: 2 },
        );
      });

    const runCheck: WorktreeHealthMonitorShape["runCheck"] = (input) =>
      runMutex.withPermits(1)(
        Effect.gen(function* () {
          const settings = yield* serverSettings.getSettings.pipe(
            Effect.orElseSucceed(() => DEFAULT_SERVER_SETTINGS),
          );
          const thresholds: WorktreeHealthThresholds = {
            deadCountThreshold: settings.worktreeHealthDeadCountThreshold,
            lowDiskGb: settings.worktreeHealthLowDiskGb,
          };

          const classifications = yield* classifyProjects();
          const diskBefore = yield* measureDisk(worktreesDir);

          // Per-project counts and the auto-removable set.
          const perProjectAuto = classifications.map((classification) => ({
            classification,
            autoCandidates: selectAutoCleanupCandidates(classification.candidates),
          }));

          const deadDirtyByProject = (classification: ProjectClassification): number =>
            classification.candidates.filter((candidate) => candidate.isDirty).length;

          let removedByProjectId = new Map<string, number>();
          let autoCleanup: WorktreeHealthSnapshot["autoCleanup"] = null;

          const deadCleanCountBefore = perProjectAuto.reduce(
            (sum, entry) => sum + entry.autoCandidates.length,
            0,
          );
          const deadCount = classifications.reduce(
            (sum, classification) => sum + classification.candidates.length,
            0,
          );
          const deadDirtyCount = classifications.reduce(
            (sum, classification) => sum + deadDirtyByProject(classification),
            0,
          );

          const preEvaluation = evaluateWorktreeHealth({
            deadCleanCount: deadCleanCountBefore,
            freeBytes: diskBefore.freeBytes,
            thresholds,
          });

          let disk = diskBefore;

          if (preEvaluation.breached && settings.worktreeHealthAutoCleanup) {
            let removedCount = 0;
            let failedCount = 0;
            const removedMap = new Map<string, number>();

            for (const entry of perProjectAuto) {
              if (entry.autoCandidates.length === 0) continue;
              const result = yield* cleanup
                .execute({
                  cwd: entry.classification.cwd,
                  candidates: entry.autoCandidates.map((candidate) => ({
                    worktreePath: candidate.worktreePath,
                    branch: candidate.branch,
                    threadIds: candidate.threadIds,
                    diskBytes: 0,
                  })),
                  // Auto mode deletes worktree directories only. Branches and
                  // checkpoints are never touched, and gc is left for manual runs.
                  deleteBranches: false,
                  pruneCheckpoints: false,
                  runGc: false,
                })
                .pipe(
                  Effect.catch((error: GitCommandError) =>
                    Effect.logWarning("worktree.health.auto-cleanup-project-failed", {
                      cwd: entry.classification.cwd,
                      error,
                    }).pipe(
                      Effect.as({
                        results: [] as ReadonlyArray<{ readonly ok: boolean }>,
                        reclaimedBytes: 0,
                      }),
                    ),
                  ),
                );
              const projectRemoved = result.results.filter((row) => row.ok).length;
              const projectFailed = result.results.filter((row) => !row.ok).length;
              removedCount += projectRemoved;
              failedCount += projectFailed;
              if (projectRemoved > 0)
                removedMap.set(entry.classification.projectId, projectRemoved);
            }

            const diskAfter = yield* measureDisk(worktreesDir);
            const freedBytes =
              diskAfter.freeBytes !== null && diskBefore.freeBytes !== null
                ? Math.max(0, diskAfter.freeBytes - diskBefore.freeBytes)
                : 0;
            autoCleanup = { removedCount, failedCount, freedBytes };
            removedByProjectId = removedMap;
            disk = diskAfter;
          }

          const perProject: ReadonlyArray<WorktreeHealthProjectSummary> = perProjectAuto.map(
            (entry) => {
              const removed = removedByProjectId.get(entry.classification.projectId) ?? 0;
              return {
                projectId: entry.classification.projectId,
                cwd: entry.classification.cwd,
                deadCleanCount: Math.max(0, entry.autoCandidates.length - removed),
                deadDirtyCount: deadDirtyByProject(entry.classification),
                error: entry.classification.error,
              };
            },
          );

          const deadCleanCountAfter = perProject.reduce(
            (sum, summary) => sum + summary.deadCleanCount,
            0,
          );
          const removedTotal = deadCleanCountBefore - deadCleanCountAfter;

          const evaluation = evaluateWorktreeHealth({
            deadCleanCount: deadCleanCountAfter,
            freeBytes: disk.freeBytes,
            thresholds,
          });

          const checkedAt = DateTime.formatIso(yield* DateTime.now);
          const snapshot: WorktreeHealthSnapshot = {
            checkedAt,
            trigger: input.trigger,
            freeBytes: disk.freeBytes,
            totalBytes: disk.totalBytes,
            deadCount: Math.max(0, deadCount - removedTotal),
            deadCleanCount: deadCleanCountAfter,
            deadDirtyCount,
            perProject,
            thresholds,
            breached: evaluation.breached,
            breachReasons: evaluation.breachReasons,
            autoCleanup,
          };

          yield* publish(snapshot);
          return snapshot;
        }),
      );

    const runGuarded = (trigger: WorktreeHealthTrigger) =>
      runCheck({ trigger }).pipe(
        Effect.asVoid,
        Effect.catch((error: unknown) =>
          Effect.logWarning("worktree.health.sweep-failed", { error }),
        ),
        Effect.catchDefect((defect: unknown) =>
          Effect.logWarning("worktree.health.sweep-defect", { defect }),
        ),
      );

    const start: WorktreeHealthMonitorShape["start"] = () =>
      Effect.gen(function* () {
        yield* Effect.forkScoped(
          Effect.sleep(Duration.millis(startupDelayMs)).pipe(
            Effect.andThen(runGuarded("startup")),
            Effect.andThen(
              Effect.forever(
                Effect.sleep(Duration.millis(intervalMs)).pipe(
                  Effect.andThen(
                    backgroundPolicy.shouldRunOpportunisticWork.pipe(
                      Effect.flatMap((shouldRun) =>
                        shouldRun
                          ? runGuarded("interval")
                          : Effect.logDebug("worktree.health.skipped-idle"),
                      ),
                    ),
                  ),
                ),
              ),
            ),
          ),
        );
        yield* Effect.logInfo("worktree.health.started", { startupDelayMs, intervalMs });
      });

    return WorktreeHealthMonitor.of({
      start,
      runCheck,
      current: Ref.get(snapshotRef),
      streamChanges: Stream.fromPubSub(changes),
    });
  });

export const layer = Layer.effect(WorktreeHealthMonitor, makeWorktreeHealthMonitor());

export const makeWorktreeHealthMonitorLive = (options: WorktreeHealthMonitorOptions) =>
  Layer.effect(WorktreeHealthMonitor, makeWorktreeHealthMonitor(options));
