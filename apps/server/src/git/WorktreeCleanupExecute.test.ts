import type { VcsStatusLocalResult } from "@t3tools/contracts";
import { ProjectId, ThreadId } from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { describe, expect } from "vite-plus/test";

import { CheckpointStore } from "../checkpointing/CheckpointStore.ts";
import * as ServerConfigModule from "../config.ts";
import { ProjectionThreadRepository } from "../persistence/Services/ProjectionThreads.ts";
import { ProviderSessionDirectory } from "../provider/Services/ProviderSessionDirectory.ts";
import { GitWorkflowService } from "./GitWorkflowService.ts";
import * as WorktreeCleanup from "./WorktreeCleanup.ts";

const cleanLocalStatus = { hasWorkingTreeChanges: false } as unknown as VcsStatusLocalResult;

interface Counters {
  pruneCalls: number;
  removeWorktreeCalls: number;
  gcCalls: number;
}

interface MockState {
  worktrees: ReadonlyArray<{ path: string; branch: string | null; isMain: boolean }>;
  threads: ReadonlyArray<{
    threadId: string;
    worktreePath: string | null;
    branch: string | null;
    archivedAt: string | null;
  }>;
  activeThreadIds: ReadonlyArray<string>;
}

// The mock reads `state` lazily at call time so a test can fill it after it has
// resolved ServerConfig and therefore the managed worktrees directory.
function makeDeps(counters: Counters, state: MockState) {
  const gitWorkflowLayer = Layer.mock(GitWorkflowService)({
    listWorktrees: () =>
      Effect.succeed(
        state.worktrees.map((entry) => ({
          path: entry.path,
          branch: entry.branch,
          isMain: entry.isMain,
          isBare: false,
          isDetached: false,
          isLocked: false,
        })),
      ),
    localStatus: () => Effect.succeed(cleanLocalStatus),
    removeWorktree: () => {
      counters.removeWorktreeCalls += 1;
      return Effect.void;
    },
    pruneWorktrees: () => {
      counters.pruneCalls += 1;
      return Effect.void;
    },
    deleteBranch: () => Effect.void,
    gc: () => {
      counters.gcCalls += 1;
      return Effect.void;
    },
  });

  const checkpointLayer = Layer.mock(CheckpointStore)({
    deleteThreadCheckpointRefs: () => Effect.void,
  });

  const threadRepoLayer = Layer.mock(ProjectionThreadRepository)({
    listByProjectId: () =>
      Effect.succeed(
        state.threads.map((thread) => ({
          threadId: ThreadId.make(thread.threadId),
          worktreePath: thread.worktreePath,
          branch: thread.branch,
          archivedAt: thread.archivedAt,
          settledOverride: null,
          deletedAt: null,
        })) as never,
      ),
  });

  const sessionDirLayer = Layer.mock(ProviderSessionDirectory)({
    listBindings: () =>
      Effect.succeed(
        state.activeThreadIds.map((id) => ({
          threadId: ThreadId.make(id),
          provider: "claude" as never,
          status: "running" as never,
          lastSeenAt: "2026-01-01T00:00:00.000Z",
        })) as never,
      ),
  });

  return Layer.mergeAll(
    gitWorkflowLayer,
    checkpointLayer,
    threadRepoLayer,
    sessionDirLayer,
    ServerConfigModule.layerTest(process.cwd(), { prefix: "t3-wt-cleanup-exec-" }).pipe(
      Layer.provide(NodeServices.layer),
    ),
    NodeServices.layer,
  );
}

const emptyState = (): MockState => ({ worktrees: [], threads: [], activeThreadIds: [] });

describe("WorktreeCleanupService.execute", () => {
  it.effect("deletes the worktree directory, prunes once, and never shells out to git remove", () =>
    Effect.gen(function* () {
      const counters: Counters = { pruneCalls: 0, removeWorktreeCalls: 0, gcCalls: 0 };
      const deps = makeDeps(counters, emptyState());

      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfigModule.ServerConfig;
        const worktreePath = path.join(config.worktreesDir, "repo", "t3code-abcd1234");
        const nested = path.join(worktreePath, "node_modules", "deep");
        yield* fs.makeDirectory(nested, { recursive: true });
        yield* fs.writeFileString(path.join(nested, "index.js"), "module.exports = 1;");

        const service = yield* WorktreeCleanup.make;
        const result = yield* service.execute({
          cwd: config.cwd,
          candidates: [{ worktreePath, branch: "feature/x", threadIds: [], diskBytes: 0 }],
          deleteBranches: false,
          pruneCheckpoints: false,
          runGc: false,
        });

        expect(result.results).toHaveLength(1);
        expect(result.results[0]?.ok).toBe(true);
        expect(yield* fs.exists(worktreePath)).toBe(false);
        expect(counters.pruneCalls).toBe(1);
        expect(counters.removeWorktreeCalls).toBe(0);
        expect(counters.gcCalls).toBe(0);
      }).pipe(Effect.provide(deps));
    }),
  );

  it.effect("refuses to delete a path outside the managed worktrees directory", () =>
    Effect.gen(function* () {
      const counters: Counters = { pruneCalls: 0, removeWorktreeCalls: 0, gcCalls: 0 };
      const deps = makeDeps(counters, emptyState());

      yield* Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const config = yield* ServerConfigModule.ServerConfig;
        const outside = path.join(config.baseDir, "not-a-worktree");
        yield* fs.makeDirectory(outside, { recursive: true });

        const service = yield* WorktreeCleanup.make;
        const result = yield* service.execute({
          cwd: config.cwd,
          candidates: [{ worktreePath: outside, branch: null, threadIds: [], diskBytes: 0 }],
          deleteBranches: false,
          pruneCheckpoints: false,
          runGc: false,
        });

        expect(result.results[0]?.ok).toBe(false);
        expect(result.results[0]?.error).toContain("outside");
        expect(yield* fs.exists(outside)).toBe(true);
        expect(counters.removeWorktreeCalls).toBe(0);
      }).pipe(Effect.provide(deps));
    }),
  );
});

describe("WorktreeCleanupService.classify", () => {
  it.effect(
    "marks a candidate active from a live session binding and reports zero disk bytes",
    () =>
      Effect.gen(function* () {
        const counters: Counters = { pruneCalls: 0, removeWorktreeCalls: 0, gcCalls: 0 };
        const state = emptyState();
        const deps = makeDeps(counters, state);

        yield* Effect.gen(function* () {
          const path = yield* Path.Path;
          const config = yield* ServerConfigModule.ServerConfig;
          const worktreePath = path.join(config.worktreesDir, "repo", "t3code-active01");
          state.worktrees = [{ path: worktreePath, branch: "feature/x", isMain: false }];
          state.threads = [
            {
              threadId: "t-active",
              worktreePath,
              branch: "feature/x",
              archivedAt: "2026-01-01T00:00:00.000Z",
            },
          ];
          state.activeThreadIds = ["t-active"];

          const service = yield* WorktreeCleanup.make;
          const candidates = yield* service.classify({
            cwd: config.cwd,
            projectId: ProjectId.make("p1"),
          });

          expect(candidates).toHaveLength(1);
          expect(candidates[0]?.isActive).toBe(true);
          expect(candidates[0]?.diskBytes).toBe(0);
        }).pipe(Effect.provide(deps));
      }),
  );
});
