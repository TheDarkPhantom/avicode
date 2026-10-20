import { GitCommandError } from "@t3tools/contracts";
import { it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import { describe, expect } from "vite-plus/test";

import { GitWorkflowService } from "./GitWorkflowService.ts";
import { restoreThreadWorktree } from "./restoreThreadWorktree.ts";

interface CreateCall {
  readonly cwd: string;
  readonly refName: string;
  readonly newRefName?: string | undefined;
  readonly path: string | null;
}

function makeGitLayer(state: {
  readonly calls: CreateCall[];
  prunes: number;
  /** Fail `createWorktree` calls that check out an existing ref (no newRefName). */
  readonly existingBranchMissing?: boolean;
}) {
  return Layer.mock(GitWorkflowService)({
    pruneWorktrees: () => {
      state.prunes += 1;
      return Effect.void;
    },
    createWorktree: (input) => {
      state.calls.push({
        cwd: input.cwd,
        refName: input.refName,
        newRefName: input.newRefName,
        path: input.path,
      });
      if (state.existingBranchMissing && input.newRefName === undefined) {
        return Effect.fail(
          new GitCommandError({
            operation: "GitVcsDriver.createWorktree",
            command: "git worktree add",
            cwd: input.cwd,
            detail: `invalid reference: ${input.refName}`,
          }),
        );
      }
      return Effect.succeed({
        worktree: { path: input.path ?? "", refName: input.newRefName ?? input.refName },
      });
    },
  });
}

const setup = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const baseDir = yield* fs.makeTempDirectoryScoped({ prefix: "t3-restore-wt-" });
  const worktreesDir = path.join(baseDir, "worktrees");
  const projectRoot = path.join(baseDir, "repo");
  yield* fs.makeDirectory(path.join(worktreesDir, "repo"), { recursive: true });
  yield* fs.makeDirectory(projectRoot, { recursive: true });
  return { fs, path, baseDir, worktreesDir, projectRoot };
});

describe("restoreThreadWorktree", () => {
  it.effect("recreates a missing worktree at the same path from its branch", () =>
    Effect.gen(function* () {
      const state = { calls: [] as CreateCall[], prunes: 0 };
      yield* Effect.gen(function* () {
        const { path, worktreesDir, projectRoot } = yield* setup;
        const worktreePath = path.join(worktreesDir, "repo", "t3code-gone0001");

        const outcome = yield* restoreThreadWorktree({
          worktreePath,
          branch: "t3code/feature",
          projectRoot,
          worktreesDir,
        });

        expect(outcome).toEqual({ status: "restored", branchRecreated: false });
        expect(state.prunes).toBe(1);
        expect(state.calls).toEqual([
          {
            cwd: projectRoot,
            refName: "t3code/feature",
            newRefName: undefined,
            path: worktreePath,
          },
        ]);
      }).pipe(Effect.provide(makeGitLayer(state)), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("recreates the branch from HEAD when it no longer exists", () =>
    Effect.gen(function* () {
      const state = { calls: [] as CreateCall[], prunes: 0, existingBranchMissing: true };
      yield* Effect.gen(function* () {
        const { path, worktreesDir, projectRoot } = yield* setup;
        const worktreePath = path.join(worktreesDir, "repo", "t3code-gone0002");

        const outcome = yield* restoreThreadWorktree({
          worktreePath,
          branch: "t3code/merged",
          projectRoot,
          worktreesDir,
        });

        expect(outcome).toEqual({ status: "restored", branchRecreated: true });
        expect(state.calls[1]).toEqual({
          cwd: projectRoot,
          refName: "HEAD",
          newRefName: "t3code/merged",
          path: worktreePath,
        });
      }).pipe(Effect.provide(makeGitLayer(state)), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("does nothing when the folder is still there", () =>
    Effect.gen(function* () {
      const state = { calls: [] as CreateCall[], prunes: 0 };
      yield* Effect.gen(function* () {
        const { fs, path, worktreesDir, projectRoot } = yield* setup;
        const worktreePath = path.join(worktreesDir, "repo", "t3code-here0001");
        yield* fs.makeDirectory(worktreePath, { recursive: true });

        const outcome = yield* restoreThreadWorktree({
          worktreePath,
          branch: "t3code/feature",
          projectRoot,
          worktreesDir,
        });

        expect(outcome).toEqual({ status: "present" });
        expect(state.calls).toEqual([]);
        expect(state.prunes).toBe(0);
      }).pipe(Effect.provide(makeGitLayer(state)), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("never recreates a folder outside the managed worktrees directory", () =>
    Effect.gen(function* () {
      const state = { calls: [] as CreateCall[], prunes: 0 };
      yield* Effect.gen(function* () {
        const { path, baseDir, worktreesDir, projectRoot } = yield* setup;

        const outcome = yield* restoreThreadWorktree({
          worktreePath: path.join(baseDir, "elsewhere", "checkout"),
          branch: "t3code/feature",
          projectRoot,
          worktreesDir,
        });

        expect(outcome).toEqual({ status: "skipped" });
        expect(state.calls).toEqual([]);
      }).pipe(Effect.provide(makeGitLayer(state)), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("skips threads that run in the project root", () =>
    Effect.gen(function* () {
      const state = { calls: [] as CreateCall[], prunes: 0 };
      yield* Effect.gen(function* () {
        const { worktreesDir, projectRoot } = yield* setup;

        const outcome = yield* restoreThreadWorktree({
          worktreePath: null,
          branch: null,
          projectRoot,
          worktreesDir,
        });

        expect(outcome).toEqual({ status: "skipped" });
        expect(state.calls).toEqual([]);
      }).pipe(Effect.provide(makeGitLayer(state)), Effect.scoped);
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
