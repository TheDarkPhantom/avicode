/**
 * restoreThreadWorktree - rebuild a thread's worktree folder if it vanished.
 *
 * Avi Code addition. Worktree cleanup (manual or the background health
 * monitor) deletes worktree directories but leaves the thread, its branch, and
 * the provider's saved conversation in place. Starting a provider in the
 * missing folder fails instantly ("Claude runtime stream failed"), so every
 * later turn in that thread broke. Before a session starts, this checks the
 * folder and recreates it at the *same path* from the thread's branch. The path
 * matters: Claude keys its saved conversation by working directory, so a new
 * location would lose the history.
 *
 * @module restoreThreadWorktree
 */
import type { GitCommandError } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import { GitWorkflowService } from "./GitWorkflowService.ts";
import { isUnderWorktreesDir } from "./WorktreeCleanup.ts";

export interface RestoreThreadWorktreeInput {
  readonly worktreePath: string | null;
  readonly branch: string | null;
  /** The project's main checkout, where `git worktree add` runs. */
  readonly projectRoot: string | undefined;
  /** App-managed worktrees directory; folders outside it are never recreated. */
  readonly worktreesDir: string;
}

export type RestoreThreadWorktreeOutcome =
  | { readonly status: "present" }
  | { readonly status: "skipped" }
  | { readonly status: "restored"; readonly branchRecreated: boolean };

export const restoreThreadWorktree = Effect.fn("restoreThreadWorktree")(function* (
  input: RestoreThreadWorktreeInput,
): Effect.fn.Return<
  RestoreThreadWorktreeOutcome,
  GitCommandError,
  FileSystem.FileSystem | GitWorkflowService
> {
  const worktreePath = input.worktreePath;
  if (worktreePath === null || input.projectRoot === undefined) {
    return { status: "skipped" };
  }
  if (!isUnderWorktreesDir(worktreePath, input.worktreesDir)) {
    return { status: "skipped" };
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const exists = yield* fileSystem.exists(worktreePath).pipe(Effect.orElseSucceed(() => true));
  if (exists) {
    return { status: "present" };
  }

  const gitWorkflow = yield* GitWorkflowService;
  const cwd = input.projectRoot;
  // Cleanup deletes the directory directly, so git may still list it as a
  // worktree holding the branch. Prune first or `worktree add` refuses.
  yield* gitWorkflow.pruneWorktrees({ cwd }).pipe(Effect.ignore);

  const refName = input.branch ?? "HEAD";
  const checkout = yield* gitWorkflow
    .createWorktree({ cwd, refName, path: worktreePath })
    .pipe(Effect.result);
  if (checkout._tag === "Success") {
    return { status: "restored", branchRecreated: false };
  }
  if (input.branch === null) {
    return yield* checkout.failure;
  }

  // The branch itself is gone (e.g. deleted after its PR merged). Recreate it
  // from the project's current HEAD so the thread can keep working.
  const recreated = yield* gitWorkflow
    .createWorktree({ cwd, refName: "HEAD", newRefName: input.branch, path: worktreePath })
    .pipe(Effect.result);
  if (recreated._tag === "Success") {
    return { status: "restored", branchRecreated: true };
  }
  // Report the first failure: it explains why the existing branch was unusable.
  return yield* checkout.failure;
});
