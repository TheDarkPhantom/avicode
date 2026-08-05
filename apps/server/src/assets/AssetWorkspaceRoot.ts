import {
  AssetWorkspaceContextNotFoundError,
  AssetWorkspaceContextResolutionError,
  type AssetResource,
  type ProjectId,
  type ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

export type WorkspaceFileAssetResource = Extract<
  AssetResource,
  { readonly _tag: "workspace-file" }
>;

/**
 * Avi Code addition: decides which repository root a workspace-file asset is
 * served from.
 *
 * Upstream always used the thread's own worktree or project root, which is
 * right until the file surface is showing another repository. An agent that
 * names a file in a sibling repo opens it against that repo's root, so the
 * asset pipeline rejected the file as outside the workspace and the image
 * failed to load while its text neighbours opened fine.
 *
 * The containment rule is deliberate and narrow: a client-supplied root is
 * honoured only when it names a REGISTERED project. An asset URL is a signed,
 * plainly fetchable HTTP token, so it must never be able to point at an
 * arbitrary path the client asked for. A root that is not a registered project
 * is refused rather than quietly falling back to the thread's own, because
 * falling back would serve the wrong file or a confusing "not found".
 */
export const resolveWorkspaceFileAssetRoot = Effect.fn("AssetWorkspaceRoot.resolve")(function* <
  EProject,
  EThread,
  EProjectShell,
>(input: {
  readonly resource: WorkspaceFileAssetResource;
  readonly getActiveProjectByWorkspaceRoot: (
    workspaceRoot: string,
  ) => Effect.Effect<Option.Option<{ readonly workspaceRoot: string }>, EProject>;
  readonly getThreadShellById: (
    threadId: ThreadId,
  ) => Effect.Effect<
    Option.Option<{ readonly projectId: ProjectId; readonly worktreePath: string | null }>,
    EThread
  >;
  readonly getProjectShellById: (
    projectId: ProjectId,
  ) => Effect.Effect<Option.Option<{ readonly workspaceRoot: string }>, EProjectShell>;
}) {
  const { resource } = input;
  const failResolution = (cause: unknown) =>
    new AssetWorkspaceContextResolutionError({ resource, cause });
  const notFound = () => new AssetWorkspaceContextNotFoundError({ resource });

  if (resource.workspaceRoot !== undefined) {
    const project = yield* input
      .getActiveProjectByWorkspaceRoot(resource.workspaceRoot)
      .pipe(Effect.mapError(failResolution));
    if (Option.isNone(project)) {
      return yield* notFound();
    }
    return project.value.workspaceRoot;
  }

  const thread = yield* input
    .getThreadShellById(resource.threadId)
    .pipe(Effect.mapError(failResolution));
  if (Option.isNone(thread)) {
    return yield* notFound();
  }
  const project = yield* input
    .getProjectShellById(thread.value.projectId)
    .pipe(Effect.mapError(failResolution));
  if (Option.isNone(project)) {
    return yield* notFound();
  }
  return thread.value.worktreePath ?? project.value.workspaceRoot;
});
