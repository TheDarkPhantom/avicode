import { describe, expect, it } from "vite-plus/test";

import {
  clampRightPanelChatWidth,
  resolveInitialRightPanelChatWidth,
  rebaseRightPanelChatWidthForZoom,
  resolveRightPanelLayout,
  resizeRightPanelChatWidthFromKey,
} from "./rightPanelLayout";

describe("right panel split layout", () => {
  it("derives the initial chat width from the default panel width", () => {
    expect(
      resolveInitialRightPanelChatWidth({
        containerWidth: 1_400,
        storedChatWidth: null,
        legacyPanelWidth: null,
      }),
    ).toBe(860);
  });

  it("migrates the legacy persisted panel width into a divider position", () => {
    expect(
      resolveInitialRightPanelChatWidth({
        containerWidth: 1_400,
        storedChatWidth: null,
        legacyPanelWidth: 620,
      }),
    ).toBe(780);
  });

  it("prefers a valid saved chat width and rejects invalid persisted values", () => {
    expect(
      resolveInitialRightPanelChatWidth({
        containerWidth: 1_400,
        storedChatWidth: 760,
        legacyPanelWidth: 620,
      }),
    ).toBe(760);
    expect(
      resolveInitialRightPanelChatWidth({
        containerWidth: 1_400,
        storedChatWidth: Number.NaN,
        legacyPanelWidth: Number.POSITIVE_INFINITY,
      }),
    ).toBe(860);
  });

  it("keeps chat fixed while outer-window changes flow into the panel", () => {
    expect(resolveRightPanelLayout(1_400, 760)).toEqual({
      chatWidth: 760,
      panelWidth: 640,
      fitsInline: true,
    });
    expect(resolveRightPanelLayout(1_200, 760)).toEqual({
      chatWidth: 760,
      panelWidth: 440,
      fitsInline: true,
    });
  });

  it("selects the overlay layout when the panel minimum no longer fits", () => {
    expect(resolveRightPanelLayout(1_100, 760)).toEqual({
      chatWidth: 760,
      panelWidth: 340,
      fitsInline: false,
    });
  });

  it("clamps deliberate divider movement to usable pane widths", () => {
    expect(clampRightPanelChatWidth(100, 1_400)).toBe(360);
    expect(clampRightPanelChatWidth(1_300, 1_400)).toBe(1_040);
    expect(clampRightPanelChatWidth(740, 1_400)).toBe(740);
  });

  it("resizes from the keyboard in normal and accelerated steps", () => {
    expect(
      resizeRightPanelChatWidthFromKey({
        key: "ArrowRight",
        shiftKey: false,
        currentWidth: 700,
        containerWidth: 1_400,
      }),
    ).toBe(710);
    expect(
      resizeRightPanelChatWidthFromKey({
        key: "ArrowLeft",
        shiftKey: true,
        currentWidth: 700,
        containerWidth: 1_400,
      }),
    ).toBe(650);
  });

  it("keeps the panel width stable when zoom changes the CSS viewport", () => {
    expect(
      rebaseRightPanelChatWidthForZoom({
        previousContainerWidth: 1_400,
        nextContainerWidth: 2_016,
        previousChatWidth: 860,
      }),
    ).toBe(1_476);
    expect(
      rebaseRightPanelChatWidthForZoom({
        previousContainerWidth: 1_400,
        nextContainerWidth: 972,
        previousChatWidth: 860,
      }),
    ).toBe(432);
  });

  it("keeps both panes usable when zoom leaves too little room", () => {
    expect(
      rebaseRightPanelChatWidthForZoom({
        previousContainerWidth: 1_400,
        nextContainerWidth: 600,
        previousChatWidth: 860,
      }),
    ).toBe(360);
  });
});
