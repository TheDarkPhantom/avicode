import { describe, expect, it } from "vite-plus/test";

import { resolveWindowControlsOverlayGeometry } from "./windowControlsOverlay";

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
