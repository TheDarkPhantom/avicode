// Avi Code addition: the reopen-closed-tab analogue for threads. Restores the
// most recently archived thread across every environment and navigates to it,
// mirroring a browser's Ctrl+Shift+T. Repeated presses walk back through archive
// history for free, because unarchiving drops the thread from the archived list.
import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import { useArchivedThreadSnapshots } from "../lib/archivedThreadsState";
import { useProjects } from "../state/entities";
import { buildThreadRouteParams } from "../threadRoutes";
import { useThreadActions } from "./useThreadActions";

export function useReopenLastArchivedThread(): () => Promise<void> {
  const projects = useProjects();
  const navigate = useNavigate();
  const { unarchiveThread } = useThreadActions();
  const environmentIds = useMemo(
    () => [...new Set(projects.map((project) => project.environmentId))],
    [projects],
  );
  const { snapshots } = useArchivedThreadSnapshots(environmentIds);

  return useCallback(async () => {
    // Flatten every environment's archived threads, then pick the one archived
    // most recently. Matches the "recentlyArchived" comparator in
    // ArchivedThreadsPanel (falling back to createdAt when archivedAt is null).
    const archived = snapshots.flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.map((thread) => ({ ...thread, environmentId })),
    );
    let last: (typeof archived)[number] | null = null;
    for (const thread of archived) {
      if (last === null) {
        last = thread;
        continue;
      }
      const threadKey = thread.archivedAt ?? thread.createdAt;
      const lastKey = last.archivedAt ?? last.createdAt;
      if (threadKey.localeCompare(lastKey) > 0) {
        last = thread;
      }
    }
    if (last === null) {
      // Silent no-op: nothing archived, like reopen-closed-tab with no history.
      return;
    }

    const ref = scopeThreadRef(last.environmentId, last.id);
    const result = await unarchiveThread(ref);
    if (result._tag === "Success") {
      void navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(ref),
      });
    }
  }, [navigate, snapshots, unarchiveThread]);
}
