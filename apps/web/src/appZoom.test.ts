import { describe, expect, it } from "vite-plus/test";

import { appCssPixelsToWindowUnits, appZoomFactorFromLevel } from "./appZoom";

describe("app zoom geometry", () => {
  it("matches Chromium's logarithmic zoom scale", () => {
    expect(appZoomFactorFromLevel(-2)).toBeCloseTo(0.6944);
    expect(appZoomFactorFromLevel(0)).toBe(1);
    expect(appZoomFactorFromLevel(2)).toBeCloseTo(1.44);
  });

  it("converts CSS panel widths to native window units", () => {
    expect(appCssPixelsToWindowUnits(540, -2)).toBe(375);
    expect(appCssPixelsToWindowUnits(540, 0)).toBe(540);
    expect(appCssPixelsToWindowUnits(540, 2)).toBe(778);
  });
});
