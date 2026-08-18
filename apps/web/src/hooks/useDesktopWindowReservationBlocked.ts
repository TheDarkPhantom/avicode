import { useEffect, useState } from "react";

import { isElectron } from "../env";

/**
 * Avi Code addition: reports whether the desktop window is fullscreen or maximized —
 * the states where the native window cannot grow to reserve right-panel space. When
 * blocked, the right panel falls back to the overlay sheet instead of the window-growth
 * split, so the chat column never shrinks. Returns `false` on web or when the desktop
 * bridge is unavailable.
 */
export function useDesktopWindowReservationBlocked(): boolean {
  const [blocked, setBlocked] = useState(() => {
    const getBlocked = window.desktopBridge?.getWindowPanelReservationBlocked;
    return isElectron && typeof getBlocked === "function" ? getBlocked() : false;
  });

  useEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge;
    if (!bridge) return;
    const { getWindowPanelReservationBlocked, onWindowPanelReservationBlockedChange } = bridge;
    if (
      typeof getWindowPanelReservationBlocked !== "function" ||
      typeof onWindowPanelReservationBlockedChange !== "function"
    ) {
      return;
    }

    const unsubscribe = onWindowPanelReservationBlockedChange(setBlocked);
    setBlocked(getWindowPanelReservationBlocked());
    return unsubscribe;
  }, []);

  return blocked;
}
