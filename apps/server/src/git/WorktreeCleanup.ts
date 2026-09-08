/**
 * WorktreeCleanup - scan and delete dead/finished worktrees per repo.
 *
 * Avi Code addition. Long-running t3code use accumulates many git worktrees
 * (each a full checkout, so `node_modules` is duplicated per worktree), plus
 * local branches and per-turn checkpoint refs (`refs/t3/checkpoints/*`). Nothing
 * removed these in bulk, so disk grew into 100s of GB. This service reconciles
 * projection threads against on-disk worktrees, classifies the dead ones, and on
 * request removes the worktree dir, deletes its branch, prunes checkpoint refs,
 * and runs `git gc`.
 *
 * `computeCleanupCandidates` is a pure function (unit-tested without git) so the
 * classification and safety rules can be verified in isolation.
 *
 * @module WorktreeCleanup
 */
import {
  GitCommandError,
  ProjectId,
  type ThreadId,
  type VcsCleanupCandidateResult,
  type VcsExecuteCleanupInput,
  type VcsExecuteCleanupResult,
  type VcsScanCleanupInput,
  type VcsScanCleanupResult,
  type WorktreeCleanupCandidate,
  type WorktreeCleanupReason,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";

import { CheckpointStore } from "../checkpointing/CheckpointStore.ts";
import { ServerConfig } from "../config.ts";
import { ProjectionThreadRepository } from "../persistence/Services/ProjectionThreads.ts";
import { GitWorkflowService } from "./GitWorkflowService.ts";

export type PrState = "open" | "closed" | "merged";

/** Minimal thread shape the classifier needs. */
export interface CleanupThreadInfo {
  readonly threadId: ThreadId;
  readonly worktreePath: string | null;
  readonly branch: string | null;
  readonly archivedAt: string | null;
  readonly settledOverride: "settled" | "active" | null;
  readonly deletedAt: string | null;
}

/** Minimal on-disk worktree shape the classifier needs. */
export interface CleanupWorktreeInfo {
  readonly path: string;
  readonly branch: string | null;
  readonly isMain: boolean;
}

export interface ComputeCleanupCandidatesInput {
  readonly threads: ReadonlyArray<CleanupThreadInfo>;
  readonly worktrees: ReadonlyArray<CleanupWorktreeInfo>;
  readonly worktreesDir: string;
  readonly prStateByPath: ReadonlyMap<string, PrState>;
  readonly dirtyByPath: ReadonlyMap<string, boolean>;
  readonly diskBytesByPath: ReadonlyMap<string, number>;
  readonly activeThreadIds: ReadonlySet<ThreadId>;
}

export interface ComputedCleanupCandidate {
  readonly worktreePath: string;
  readonly branch: string | null;
  readonly threadId: ThreadId | null;
  readonly threadIds: ReadonlyArray<ThreadId>;
  readonly reason: WorktreeCleanupReason;
  readonly diskBytes: number;
  readonly isDirty: boolean;
  readonly isActive: boolean;
}

/**
 * Normalize a filesystem path for comparison: forward slashes, no trailing
 * slash, lowercased (Windows and macOS are case-insensitive; the safety guard
 * must not miss a match on a case difference).
 */
export function normalizePathForCompare(input: string): string {
  return input.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function isUnderWorktreesDir(path: string, worktreesDir: string): boolean {
  const base = normalizePathForCompare(worktreesDir);
  const target = normalizePathForCompare(path);
  return target !== base && target.startsWith(`${base}/`);
}

function threadIsDead(thread: CleanupThreadInfo, prState: PrState | undefined): boolean {
  return (
    thread.archivedAt !== null ||
    thread.settledOverride === "settled" ||
    prState === "merged" ||
    prState === "closed"
  );
}

function pickReason(input: {
  readonly archived: boolean;
  readonly settled: boolean;
  readonly prState: PrState | undefined;
}): WorktreeCleanupReason {
  if (input.prState === "merged") return "pr-merged";
  if (input.prState === "closed") return "pr-closed";
  if (input.archived) return "archived";
  if (input.settled) return "settled";
  return "orphaned";
}

/**
 * Pure classifier. Given projection threads and on-disk worktrees, decide which
 * worktrees are dead and therefore deletable.
 *
 * Safety rules enforced here:
 * - Never the primary working tree (`isMain`).
 * - Only worktrees under the app-managed `worktreesDir`.
 * - A worktree referenced by one or more live threads is a candidate only when
 *   every referencing (non-deleted) thread is dead.
 * - An orphaned worktree (no non-deleted thread references it) is always a
 *   candidate.
 */
export function computeCleanupCandidates(
  input: ComputeCleanupCandidatesInput,
): ReadonlyArray<ComputedCleanupCandidate> {
  const threadsByPath = groupThreadsByWorktreePath(input.threads);

  const candidates: ComputedCleanupCandidate[] = [];
  for (const worktree of input.worktrees) {
    if (worktree.isMain) continue;
    if (!isUnderWorktreesDir(worktree.path, input.worktreesDir)) continue;

    const refThreads = threadsByPath.get(normalizePathForCompare(worktree.path)) ?? [];
    const prState = input.prStateByPath.get(worktree.path);
    const isDirty = input.dirtyByPath.get(worktree.path) ?? false;
    const diskBytes = input.diskBytesByPath.get(worktree.path) ?? 0;
    const isActive = refThreads.some((thread) => input.activeThreadIds.has(thread.threadId));

    let reason: WorktreeCleanupReason;
    let threadIds: ReadonlyArray<ThreadId>;
    if (refThreads.length > 0) {
      const allDead = refThreads.every((thread) => threadIsDead(thread, prState));
      if (!allDead) continue;
      reason = pickReason({
        archived: refThreads.some((thread) => thread.archivedAt !== null),
        settled: refThreads.some((thread) => thread.settledOverride === "settled"),
        prState,
      });
      threadIds = refThreads.map((thread) => thread.threadId);
    } else {
      reason = prState === "merged" ? "pr-merged" : prState === "closed" ? "pr-closed" : "orphaned";
      threadIds = [];
    }

    candidates.push({
      worktreePath: worktree.path,
      branch: worktree.branch,
      threadId: threadIds[0] ?? null,
      threadIds,
      reason,
      diskBytes,
      isDirty,
      isActive,
    });
  }

  return candidates;
}

function groupThreadsByWorktreePath(
  threads: ReadonlyArray<CleanupThreadInfo>,
): ReadonlyMap<string, CleanupThreadInfo[]> {
  const byPath = new Map<string, CleanupThreadInfo[]>();
  for (const thread of threads) {
    if (thread.deletedAt !== null || thread.worktreePath === null) continue;
    const key = normalizePathForCompare(thread.worktreePath);
    const list = byPath.get(key) ?? [];
    list.push(thread);
    byPath.set(key, list);
  }
  return byPath;
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export class WorktreeCleanupService extends Context.Service<
  WorktreeCleanupService,
  {
    readonly scan: (
      input: VcsScanCleanupInput,
    ) => Effect.Effect<VcsScanCleanupResult, GitCommandError>;
    readonly execute: (
      input: VcsExecuteCleanupInput,
    ) => Effect.Effect<VcsExecuteCleanupResult, GitCommandError>;
  }
>()("t3/git/WorktreeCleanup/WorktreeCleanupService") {}

export const make = Effect.gen(function* () {
  const gitWorkflow = yield* GitWorkflowService;
  const checkpointStore = yield* CheckpointStore;
  const threadRepository = yield* ProjectionThreadRepository;
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const { worktreesDir } = yield* ServerConfig;

  // Recursive on-disk size of a worktree dir. `readDirectory` does not recurse
  // into symlinked directories, so there is no cycle risk; broken/denied stats
  // are ignored so one unreadable entry never fails the whole scan.
  const directorySizeBytes = (dir: string): Effect.Effect<number> =>
    Effect.gen(function* () {
      const entries = yield* fileSystem.readDirectory(dir, { recursive: true });
      let total = 0;
      yield* Effect.forEach(
        entries,
        (relative) =>
          fileSystem.stat(path.join(dir, relative)).pipe(
            Effect.map((info) => {
              if (info.type === "File") total += Number(info.size);
            }),
            Effect.orElseSucceed(() => undefined),
          ),
        { concurrency: 16, discard: true },
      );
      return total;
    }).pipe(Effect.orElseSucceed(() => 0));

  // Best-effort PR state for a worktree; network/gh failures resolve to
  // "unknown" rather than aborting the whole scan.
  const prStateFor = (cwd: string): Effect.Effect<PrState | undefined> =>
    gitWorkflow.remoteStatus({ cwd }).pipe(
      Effect.map((remote) => remote?.pr?.state),
      Effect.orElseSucceed(() => undefined),
    );

  const isDirtyFor = (cwd: string): Effect.Effect<boolean> =>
    gitWorkflow.localStatus({ cwd }).pipe(
      Effect.map((local) => local.hasWorkingTreeChanges),
      Effect.orElseSucceed(() => false),
    );

  const listThreads = (
    projectId: string,
  ): Effect.Effect<ReadonlyArray<CleanupThreadInfo>, GitCommandError> =>
    threadRepository.listByProjectId({ projectId: ProjectId.make(projectId) }).pipe(
      Effect.map((rows) =>
        rows.map((row) => ({
          threadId: row.threadId,
          worktreePath: row.worktreePath,
          branch: row.branch,
          archivedAt: row.archivedAt,
          settledOverride: row.settledOverride,
          deletedAt: row.deletedAt,
        })),
      ),
      Effect.mapError(
        (cause) =>
          new GitCommandError({
            operation: "WorktreeCleanupService.scan",
            command: "projection-threads",
            cwd: "",
            detail: "Failed to list threads for worktree cleanup.",
            cause,
          }),
      ),
    );

  const scan: WorktreeCleanupService["Service"]["scan"] = Effect.fn("WorktreeCleanupService.scan")(
    function* (input) {
      const threads = yield* listThreads(input.projectId);
      const worktrees = yield* gitWorkflow.listWorktrees({ cwd: input.cwd });

      const eligible = worktrees.filter(
        (worktree) => !worktree.isMain && isUnderWorktreesDir(worktree.path, worktreesDir),
      );

      // Only worktrees that would be dead *solely* via a merged/closed PR pay for
      // a (possibly network) remote-status lookup. Archived/settled threads and
      // orphans are already classifiable without it.
      const threadsByPath = groupThreadsByWorktreePath(threads);
      const prStateEntries = yield* Effect.forEach(
        eligible,
        (worktree) => {
          const refThreads = threadsByPath.get(normalizePathForCompare(worktree.path)) ?? [];
          const needsPrCheck =
            refThreads.length > 0 &&
            !refThreads.every(
              (thread) => thread.archivedAt !== null || thread.settledOverride === "settled",
            );
          return needsPrCheck
            ? prStateFor(worktree.path).pipe(Effect.map((state) => [worktree.path, state] as const))
            : Effect.succeed([worktree.path, undefined] as const);
        },
        { concurrency: 4 },
      );
      const prStateByPath = new Map<string, PrState>();
      for (const [path, state] of prStateEntries) {
        if (state !== undefined) prStateByPath.set(path, state);
      }

      // Pass 1: classify without disk/dirty (neither changes candidacy) so we walk
      // disk only for the worktrees we will actually offer to delete.
      const preliminary = computeCleanupCandidates({
        threads,
        worktrees: eligible,
        worktreesDir,
        prStateByPath,
        dirtyByPath: new Map(),
        diskBytesByPath: new Map(),
        activeThreadIds: new Set(),
      });

      const candidates: ReadonlyArray<WorktreeCleanupCandidate> = yield* Effect.forEach(
        preliminary,
        (candidate) =>
          Effect.all([
            directorySizeBytes(candidate.worktreePath),
            isDirtyFor(candidate.worktreePath),
          ]).pipe(
            Effect.map(([diskBytes, isDirty]) => ({
              worktreePath: candidate.worktreePath,
              branch: candidate.branch,
              threadId: candidate.threadId,
              threadIds: candidate.threadIds,
              reason: candidate.reason,
              diskBytes,
              isDirty,
              isActive: candidate.isActive,
            })),
          ),
        { concurrency: 4 },
      );

      const totalBytes = candidates.reduce((sum, candidate) => sum + candidate.diskBytes, 0);
      return { candidates, totalBytes } satisfies VcsScanCleanupResult;
    },
  );

  const execute: WorktreeCleanupService["Service"]["execute"] = Effect.fn(
    "WorktreeCleanupService.execute",
  )(function* (input) {
    const results: VcsCleanupCandidateResult[] = [];
    let reclaimedBytes = 0;

    for (const candidate of input.candidates) {
      // Re-validate before any destructive op: never touch a path outside the
      // app-managed worktrees directory.
      if (!isUnderWorktreesDir(candidate.worktreePath, worktreesDir)) {
        results.push({
          worktreePath: candidate.worktreePath,
          ok: false,
          error: "Refusing to remove a worktree outside the managed worktrees directory.",
        });
        continue;
      }

      const outcome = yield* Effect.gen(function* () {
        yield* gitWorkflow.removeWorktree({
          cwd: input.cwd,
          path: candidate.worktreePath,
          force: true,
        });
        if (input.deleteBranches && candidate.branch !== null) {
          yield* gitWorkflow
            .deleteBranch({ cwd: input.cwd, branch: candidate.branch, force: true })
            .pipe(Effect.ignore);
        }
        if (input.pruneCheckpoints) {
          yield* Effect.forEach(
            candidate.threadIds,
            (threadId) =>
              checkpointStore
                .deleteThreadCheckpointRefs({ cwd: input.cwd, threadId })
                .pipe(Effect.ignore),
            { discard: true },
          );
        }
      }).pipe(
        Effect.as({ ok: true as const, error: null as string | null }),
        Effect.catch((error) =>
          Effect.succeed({ ok: false as const, error: describeError(error) }),
        ),
      );

      results.push({ worktreePath: candidate.worktreePath, ok: outcome.ok, error: outcome.error });
      if (outcome.ok) reclaimedBytes += candidate.diskBytes;
    }

    // Prune stale worktree metadata and repack once per sweep. Best-effort: a gc
    // failure must not fail the whole cleanup.
    yield* gitWorkflow.pruneWorktrees({ cwd: input.cwd }).pipe(Effect.ignore);
    if (input.runGc) {
      yield* gitWorkflow.gc({ cwd: input.cwd }).pipe(Effect.ignore);
    }

    return { results, reclaimedBytes } satisfies VcsExecuteCleanupResult;
  });

  return WorktreeCleanupService.of({ scan, execute });
});

export const layer = Layer.effect(WorktreeCleanupService, make);
