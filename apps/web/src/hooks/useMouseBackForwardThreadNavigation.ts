import { useEffect } from "react";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { resolveMouseBackForwardThreadNavigationTarget } from "../components/Sidebar.logic";

export function useMouseBackForwardThreadNavigation<
  TThread extends {
    environmentId: ScopedThreadRef["environmentId"];
    id: ScopedThreadRef["threadId"];
  },
>(input: {
  enabled: boolean;
  active: boolean;
  orderedThreadKeys: readonly string[];
  currentThreadKey: string | null;
  getThreadByKey: (threadKey: string) => TThread | undefined;
  navigateToThread: (threadRef: ScopedThreadRef) => void;
  /**
   * Evaluated per event: when it returns true the buttons are left untouched so
   * a focused surface (e.g. the browser preview) handles its own history. Must
   * be checked at event time, not in the effect gate, since focus changes do
   * not re-run the effect.
   */
  shouldSuppress?: () => boolean;
}): void {
  const {
    active,
    currentThreadKey,
    enabled,
    getThreadByKey,
    navigateToThread,
    orderedThreadKeys,
    shouldSuppress,
  } = input;

  useEffect(() => {
    if (!enabled || !active) {
      return;
    }

    const resolveEventTarget = (event: MouseEvent) => {
      if (shouldSuppress?.()) {
        return null;
      }
      const result = resolveMouseBackForwardThreadNavigationTarget({
        enabled,
        active,
        button: event.button,
        threadIds: orderedThreadKeys,
        currentThreadId: currentThreadKey,
      });
      if (!result.shouldPreventDefault) {
        return null;
      }
      event.preventDefault();
      event.stopPropagation();
      return result.targetThreadId;
    };

    const handleMouseDown = (event: MouseEvent) => {
      const targetThreadKey = resolveEventTarget(event);
      if (targetThreadKey === null) {
        return;
      }

      const targetThread = getThreadByKey(targetThreadKey);
      if (targetThread === undefined) {
        return;
      }

      navigateToThread(scopeThreadRef(targetThread.environmentId, targetThread.id));
    };

    const handleMouseHistoryButton = (event: MouseEvent) => {
      resolveEventTarget(event);
    };

    window.addEventListener("mousedown", handleMouseDown, { capture: true });
    window.addEventListener("mouseup", handleMouseHistoryButton, { capture: true });
    window.addEventListener("auxclick", handleMouseHistoryButton, { capture: true });

    return () => {
      window.removeEventListener("mousedown", handleMouseDown, { capture: true });
      window.removeEventListener("mouseup", handleMouseHistoryButton, { capture: true });
      window.removeEventListener("auxclick", handleMouseHistoryButton, { capture: true });
    };
  }, [
    active,
    currentThreadKey,
    enabled,
    getThreadByKey,
    navigateToThread,
    orderedThreadKeys,
    shouldSuppress,
  ]);
}
