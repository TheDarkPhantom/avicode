import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { useCallback } from "react";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { readEnvironmentSupportsSettlement, readThreadShell } from "../state/entities";
import { showUndoToast } from "./showUndoToast";
import { isThreadSettledForToggle } from "./threadSettleToggle";
import * as ThreadUndo from "./threadUndo";
import { useClientSettings } from "./useSettings";
import { useThreadActions } from "./useThreadActions";

function reportFailure(title: string, error: unknown) {
  toastManager.add(
    stackedThreadToast({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    }),
  );
}

/**
 * Backs the `thread.settle` shortcut (ported from upstream #8089): settles the
 * thread, or restores it when it already reads as settled. The chat view has
 * no settled indicator and sidebar v1 has no settled tail, so both directions
 * confirm with a toast; settling offers Undo, also reachable with mod+z.
 */
export function useToggleThreadSettled() {
  const { settleThread, unsettleThread } = useThreadActions();
  const autoSettleAfterDays = useClientSettings((s) => s.sidebarAutoSettleAfterDays);

  return useCallback(
    async (threadRef: ScopedThreadRef) => {
      const shell = readThreadShell(threadRef);
      if (!shell) return;
      const settled = isThreadSettledForToggle(shell, {
        supportsSettlement: readEnvironmentSupportsSettlement(threadRef.environmentId),
        now: new Date().toISOString(),
        autoSettleAfterDays,
      });
      const description = shell.title || undefined;

      if (settled) {
        const result = await unsettleThread(threadRef);
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            reportFailure("Failed to un-settle thread", squashAtomCommandFailure(result));
          }
          return;
        }
        toastManager.add(
          stackedThreadToast({ type: "success", title: "Thread restored", description }),
        );
        return;
      }

      const result = await settleThread(threadRef);
      if (result._tag === "Failure") {
        if (!isAtomCommandInterrupted(result)) {
          reportFailure("Failed to settle thread", squashAtomCommandFailure(result));
        }
        return;
      }
      showUndoToast({
        title: "Thread settled",
        description,
        claim: ThreadUndo.begin("settle", scopedThreadKey(threadRef)),
        failureTitle: "Failed to undo settle",
        undo: () => unsettleThread(threadRef),
      });
    },
    [autoSettleAfterDays, settleThread, unsettleThread],
  );
}
