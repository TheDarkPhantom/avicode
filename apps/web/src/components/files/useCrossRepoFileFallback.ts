import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";
import { useEffect } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { resolveCrossRepoFileFallback } from "./crossRepoFileFallback";
import { isProjectFileTargetUnreachable } from "./projectFileErrorMessage";
import { useProjectFileQueryFailure } from "./projectFilesQueryState";

interface CrossRepoFileFallbackInput {
  readonly environmentId: EnvironmentId | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly surfaceId: string | null;
  /** The thread's own workspace. Null once the tab carries a root of its own. */
  readonly workspaceRoot: string | null;
  readonly relativePath: string | null;
  readonly projectRoots: readonly string[];
}

/**
 * Avi Code addition: sends a file tab to the repo that actually holds it.
 *
 * A relative path an agent writes is resolved against the thread's workspace,
 * which is wrong exactly when the agent was quoting another repo, and the tab
 * then opened onto a read failure with no way forward. This watches the read the
 * panel is already doing, and on the one failure shape that means the target was
 * never reached it re-anchors the tab on the registered project that owns the
 * path.
 *
 * Callers pass a null `workspaceRoot` for a tab that already carries its own
 * root, so a tab this corrects cannot be corrected again and it cannot loop.
 */
export function useCrossRepoFileFallback({
  environmentId,
  threadRef,
  surfaceId,
  workspaceRoot,
  relativePath,
  projectRoots,
}: CrossRepoFileFallbackInput): void {
  // Images are fetched as assets rather than read as text, so there is no read
  // here to react to and subscribing would start one the panel never wanted.
  const watchedPath =
    relativePath !== null && !isWorkspaceImagePreviewPath(relativePath) ? relativePath : null;
  const failure = useProjectFileQueryFailure(environmentId, workspaceRoot, watchedPath);

  useEffect(() => {
    if (!threadRef || !surfaceId || !workspaceRoot || !watchedPath) return;
    if (!isProjectFileTargetUnreachable(failure)) return;
    const fallback = resolveCrossRepoFileFallback(workspaceRoot, watchedPath, projectRoots);
    if (!fallback) return;
    useRightPanelStore
      .getState()
      .rerootFile(threadRef, surfaceId, fallback.root, fallback.relativePath);
  }, [failure, projectRoots, surfaceId, threadRef, watchedPath, workspaceRoot]);
}
