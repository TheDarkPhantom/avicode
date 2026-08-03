import { ProjectId, ThreadId, type AssetResource } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import { resolveWorkspaceFileAssetRoot } from "./AssetWorkspaceRoot.ts";

class TestLookupError extends Data.TaggedError("TestLookupError")<{
  readonly reason: string;
}> {}

const threadId = ThreadId.make("thread-1");
const projectId = ProjectId.make("project-1");

const OWN_ROOT = "/repos/own";
const OTHER_ROOT = "/repos/other";
const WORKTREE = "/repos/own-worktrees/feature";

function resource(workspaceRoot?: string): Extract<AssetResource, { _tag: "workspace-file" }> {
  return {
    _tag: "workspace-file",
    threadId,
    path: `${workspaceRoot ?? OWN_ROOT}/docs/diagram.png`,
    ...(workspaceRoot === undefined ? {} : { workspaceRoot }),
  };
}

function lookups(
  overrides: {
    readonly registeredRoots?: ReadonlyArray<string>;
    readonly worktreePath?: string | null;
    readonly threadMissing?: boolean;
    readonly projectMissing?: boolean;
  } = {},
) {
  const registeredRoots = overrides.registeredRoots ?? [OWN_ROOT, OTHER_ROOT];
  return {
    getActiveProjectByWorkspaceRoot: (workspaceRoot: string) =>
      Effect.succeed(
        registeredRoots.includes(workspaceRoot)
          ? Option.some({ workspaceRoot })
          : Option.none<{ readonly workspaceRoot: string }>(),
      ),
    getThreadShellById: () =>
      Effect.succeed(
        overrides.threadMissing === true
          ? Option.none<{ readonly projectId: ProjectId; readonly worktreePath: string | null }>()
          : Option.some({ projectId, worktreePath: overrides.worktreePath ?? null }),
      ),
    getProjectShellById: () =>
      Effect.succeed(
        overrides.projectMissing === true
          ? Option.none<{ readonly workspaceRoot: string }>()
          : Option.some({ workspaceRoot: OWN_ROOT }),
      ),
  };
}

describe("resolveWorkspaceFileAssetRoot", () => {
  it.effect("uses the thread's project root when no root is requested", () =>
    Effect.gen(function* () {
      const root = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(),
        ...lookups(),
      });
      expect(root).toBe(OWN_ROOT);
    }),
  );

  it.effect("prefers the thread's worktree over its project root", () =>
    Effect.gen(function* () {
      const root = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(),
        ...lookups({ worktreePath: WORKTREE }),
      });
      expect(root).toBe(WORKTREE);
    }),
  );

  it.effect("serves another registered project's root when one is requested", () =>
    Effect.gen(function* () {
      const root = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(OTHER_ROOT),
        ...lookups({ worktreePath: WORKTREE }),
      });
      expect(root).toBe(OTHER_ROOT);
    }),
  );

  it.effect("refuses a requested root that is not a registered project", () =>
    Effect.gen(function* () {
      const error = yield* resolveWorkspaceFileAssetRoot({
        resource: resource("/tmp/somewhere-else"),
        ...lookups(),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("AssetWorkspaceContextNotFoundError");
    }),
  );

  it.effect("does not fall back to the thread's root when a requested root is refused", () =>
    Effect.gen(function* () {
      const error = yield* resolveWorkspaceFileAssetRoot({
        resource: resource("/etc"),
        ...lookups({ worktreePath: WORKTREE }),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("AssetWorkspaceContextNotFoundError");
    }),
  );

  it.effect("reports a missing thread or project as not found", () =>
    Effect.gen(function* () {
      const missingThread = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(),
        ...lookups({ threadMissing: true }),
      }).pipe(Effect.flip);
      expect(missingThread._tag).toBe("AssetWorkspaceContextNotFoundError");

      const missingProject = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(),
        ...lookups({ projectMissing: true }),
      }).pipe(Effect.flip);
      expect(missingProject._tag).toBe("AssetWorkspaceContextNotFoundError");
    }),
  );

  it.effect("wraps a lookup failure as a resolution error", () =>
    Effect.gen(function* () {
      const error = yield* resolveWorkspaceFileAssetRoot({
        resource: resource(OTHER_ROOT),
        ...lookups(),
        getActiveProjectByWorkspaceRoot: () =>
          Effect.fail(new TestLookupError({ reason: "database is gone" })),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("AssetWorkspaceContextResolutionError");
    }),
  );
});
