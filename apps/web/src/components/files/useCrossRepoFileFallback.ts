import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { isWorkspaceImagePreviewPath } from "@t3tools/shared/filePreview";
import { useEffect } from "react";
import { useMemo } from "react";

import { useRightPanelStore } from "~/rightPanelStore";
import { useEnvironmentQuery } from "~/state/query";
import { projectEnvironment } from "~/state/projects";
import { buildAncestorFileCandidates } from "./crossRepoFileFallback";
import { isProjectFileMissing } from "./projectFileErrorMessage";
import { useProjectFileQueryFailure } from "./projectFilesQueryState";

interface CrossRepoFileFallbackInput {
  readonly environmentId: EnvironmentId | null;
  readonly threadRef: ScopedThreadRef | null;
  readonly surfaceId: string | null;
  /** The thread's own workspace. Null once the tab carries a root of its own. */
  readonly workspaceRoot: string | null;
  readonly relativePath: string | null;
  readonly projectRoots: readonly string[];
  /**
   * True while the owning thread is running a turn. A file missing then is
   * probably about to be written into this worktree, so re-rooting the tab onto
   * a same-named sibling repo would be wrong; useMissingFileAutoReload handles it
   * instead. Re-rooting only runs once the thread is idle and the file genuinely
   * lives in another registered repo.
   */
  readonly isThreadWorking: boolean;
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
  isThreadWorking,
}: CrossRepoFileFallbackInput): void {
  // Images are fetched as assets rather than read as text, so there is no read
  // here to react to and subscribing would start one the panel never wanted.
  const watchedPath =
    relativePath !== null && !isWorkspaceImagePreviewPath(relativePath) ? relativePath : null;
  const failure = useProjectFileQueryFailure(environmentId, workspaceRoot, watchedPath);
  const fallbackQuery = useEnvironmentQuery(
    useMemo(() => {
      if (
        environmentId === null ||
        workspaceRoot === null ||
        watchedPath === null ||
        isThreadWorking ||
        !isProjectFileMissing(failure)
      ) {
        return null;
      }
      return projectEnvironment.resolveFileFallback({
        environmentId,
        input: {
          cwd: workspaceRoot,
          relativePath: watchedPath,
          ancestorCandidates: buildAncestorFileCandidates(workspaceRoot, watchedPath),
          registeredProjectRoots: [...projectRoots],
        },
      });
    }, [environmentId, failure, isThreadWorking, projectRoots, watchedPath, workspaceRoot]),
  );

  useEffect(() => {
    if (!threadRef || !surfaceId || !workspaceRoot || !watchedPath) return;
    if (isThreadWorking || !isProjectFileMissing(failure)) return;
    const fallback = fallbackQuery.data;
    if (!fallback) return;
    useRightPanelStore
      .getState()
      .rerootFile(threadRef, surfaceId, fallback.root, fallback.relativePath);
  }, [
    failure,
    fallbackQuery.data,
    isThreadWorking,
    surfaceId,
    threadRef,
    watchedPath,
    workspaceRoot,
  ]);
}
