import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useUiStateStore } from "../uiStateStore";
import { useThreadActions } from "./useThreadActions";

/** Archive a thread, reporting failure as a toast and dropping its pin.
 *
 * Avi Code addition. This was inline in `useSidebarThreadHandlers`; the
 * `thread.archive` keybinding fires from `ChatView`, which never mounts the
 * sidebar handlers, so both entry points now share one implementation. */
export function useArchiveThreadWithFeedback() {
  const { archiveThread } = useThreadActions();
  const setThreadPinned = useUiStateStore((state) => state.setThreadPinned);

  return useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await archiveThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
        return;
      }
      // Avi Code addition: an archived thread leaves the list, so its pin goes
      // with it. Unarchiving deliberately does not restore the pin.
      setThreadPinned(scopedThreadKey(threadRef), false);
    },
    [archiveThread, setThreadPinned],
  );
}
