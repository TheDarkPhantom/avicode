import { describe, expect, it } from "vite-plus/test";

import {
  resolveClosedDesktopChatWidth,
  shouldSyncClosedDesktopChatWidth,
} from "./useRightPanelSplitLayout";

describe("desktop right-panel close layout", () => {
  it("keeps the chat width fixed while the native reservation is closing", () => {
    expect(
      resolveClosedDesktopChatWidth({
        measuredWidth: 1_640,
        preferredWidth: 1_100,
        panelOpen: false,
        reservationOpen: false,
        reservationClosing: true,
      }),
    ).toBe(1_100);
  });

  it("syncs the chat to the smaller viewport after the close settles", () => {
    expect(
      resolveClosedDesktopChatWidth({
        measuredWidth: 1_100,
        preferredWidth: 1_100,
        panelOpen: false,
        reservationOpen: false,
        reservationClosing: false,
      }),
    ).toBe(1_100);
  });

  it("tracks later window resizes while the panel remains closed", () => {
    expect(
      resolveClosedDesktopChatWidth({
        measuredWidth: 1_240,
        preferredWidth: 1_100,
        panelOpen: false,
        reservationOpen: false,
        reservationClosing: false,
      }),
    ).toBe(1_240);
  });

  it("does not replace the preferred chat width while the panel is open", () => {
    expect(
      shouldSyncClosedDesktopChatWidth({
        panelOpen: true,
        reservationOpen: true,
        reservationClosing: false,
      }),
    ).toBe(false);
  });
});
