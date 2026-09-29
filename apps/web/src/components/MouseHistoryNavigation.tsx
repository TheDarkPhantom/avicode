import { useEffect } from "react";

import { isElectron } from "../env";
import { isPreviewFocused } from "../lib/previewFocus";
import { threadTraversalDirectionFromMouseButton } from "./Sidebar.logic";

/**
 * Avi Code addition. Browsers already walk history on the mouse's back and
 * forward buttons, but Electron leaves them unhandled, so the desktop app does
 * it here. Listens in the bubble phase: the opt-in sidebar thread traversal
 * (`sidebarMouseBackForwardNavigation`) claims the same buttons in the capture
 * phase and calls `preventDefault`, so it wins whenever it is enabled.
 */
export function MouseHistoryNavigation() {
  useEffect(() => {
    if (!isElectron) return;

    const onMouseUp = (event: MouseEvent) => {
      if (event.defaultPrevented) return;
      const direction = threadTraversalDirectionFromMouseButton(event.button);
      if (direction === null) return;
      // A focused preview keeps the buttons, matching the sidebar traversal.
      if (isPreviewFocused()) return;

      event.preventDefault();
      if (direction === "previous") window.history.back();
      else window.history.forward();
    };

    window.addEventListener("mouseup", onMouseUp);
    return () => window.removeEventListener("mouseup", onMouseUp);
  }, []);

  return null;
}
