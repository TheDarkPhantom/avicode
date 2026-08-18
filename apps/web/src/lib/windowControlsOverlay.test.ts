import { describe, expect, it } from "vite-plus/test";

import {
  resolveWindowControlsOverlayGeometry,
  shouldApplyWindowControlsOverlayInset,
} from "./windowControlsOverlay";

describe("window controls overlay geometry", () => {
  it("derives the right caption-button inset from the live safe rect", () => {
    expect(
      resolveWindowControlsOverlayGeometry({
        rect: { x: 0, y: 0, width: 1_879, height: 52 },
        viewportWidth: 2_048,
      }),
    ).toEqual({ x: 0, y: 0, height: 52, rightInset: 169 });
  });

  it("supports controls placed on the left", () => {
    expect(
      resolveWindowControlsOverlayGeometry({
        rect: { x: 90, y: 2, width: 1_910, height: 48 },
        viewportWidth: 2_000,
      }),
    ).toEqual({ x: 90, y: 2, height: 48, rightInset: 0 });
  });

  it("clamps stale overlay values to safe insets", () => {
    expect(
      resolveWindowControlsOverlayGeometry({
        rect: { x: -4, y: -2, width: 2_100, height: -1 },
        viewportWidth: 2_000,
      }),
    ).toEqual({ x: 0, y: 0, height: 0, rightInset: 0 });
  });
});

describe("window controls overlay inset stability", () => {
  it("applies the first measured inset when nothing is applied yet", () => {
    expect(
      shouldApplyWindowControlsOverlayInset({
        candidateRightInset: 700,
        lastAppliedRightInset: null,
        authoritative: false,
      }),
    ).toBe(true);
  });

  it("rejects a resize-driven inset that spikes above the last stable value", () => {
    // Mid-grow: window.innerWidth already grew but the titlebar rect lagged, inflating
    // the inset by ~the panel width. Holding the last value keeps the toggle from jumping.
    expect(
      shouldApplyWindowControlsOverlayInset({
        candidateRightInset: 709,
        lastAppliedRightInset: 169,
        authoritative: false,
      }),
    ).toBe(false);
  });

  it("always applies an authoritative geometrychange snapshot", () => {
    expect(
      shouldApplyWindowControlsOverlayInset({
        candidateRightInset: 709,
        lastAppliedRightInset: 169,
        authoritative: true,
      }),
    ).toBe(true);
  });

  it("applies a resize-driven inset that stays at or below the stable value", () => {
    expect(
      shouldApplyWindowControlsOverlayInset({
        candidateRightInset: 169,
        lastAppliedRightInset: 169,
        authoritative: false,
      }),
    ).toBe(true);
  });
});
