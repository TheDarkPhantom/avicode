import type { LegendListRef } from "@legendapp/list/react";

// Avi Code addition. legend-list 3.2.0's getScrollableNode reads the inner
// scroll-view ref without a null guard, so it throws while the list is
// unmounting or re-virtualizing. Callers hit it on scroll and on unmount, so a
// throw here drops the whole chat to the error boundary. Swallow it and return
// null; a missing node just means "skip this frame".
export function getLegendListScrollNode(
  list: LegendListRef | null | undefined,
): HTMLElement | null {
  try {
    const node = list?.getScrollableNode?.();
    return node instanceof HTMLElement ? node : null;
  } catch {
    return null;
  }
}
