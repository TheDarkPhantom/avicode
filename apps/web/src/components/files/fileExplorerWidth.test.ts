import { describe, expect, it } from "vite-plus/test";

import {
  clampFileExplorerWidth,
  FILE_EXPLORER_DEFAULT_WIDTH,
  FILE_EXPLORER_MAX_WIDTH,
  FILE_EXPLORER_MIN_WIDTH,
  resizeFileExplorerWidthFromKey,
  resolveFileExplorerMaxWidth,
} from "./fileExplorerWidth";

describe("resolveFileExplorerMaxWidth", () => {
  it("leaves room for the file content", () => {
    expect(resolveFileExplorerMaxWidth(700)).toBe(444);
  });

  it("caps at the absolute maximum on wide rows", () => {
    expect(resolveFileExplorerMaxWidth(2_000)).toBe(FILE_EXPLORER_MAX_WIDTH);
  });

  it("never drops below the minimum on narrow rows", () => {
    expect(resolveFileExplorerMaxWidth(300)).toBe(FILE_EXPLORER_MIN_WIDTH);
  });

  it("falls back to the absolute maximum before the row is measured", () => {
    expect(resolveFileExplorerMaxWidth(0)).toBe(FILE_EXPLORER_MAX_WIDTH);
    expect(resolveFileExplorerMaxWidth(Number.NaN)).toBe(FILE_EXPLORER_MAX_WIDTH);
  });
});

describe("clampFileExplorerWidth", () => {
  it("keeps widths inside the bounds", () => {
    expect(clampFileExplorerWidth(300.4, 444)).toBe(300);
    expect(clampFileExplorerWidth(50, 444)).toBe(FILE_EXPLORER_MIN_WIDTH);
    expect(clampFileExplorerWidth(900, 444)).toBe(444);
  });

  it("ignores a maximum outside the absolute bounds", () => {
    expect(clampFileExplorerWidth(900, 9_999)).toBe(FILE_EXPLORER_MAX_WIDTH);
    expect(clampFileExplorerWidth(300, 10)).toBe(FILE_EXPLORER_MIN_WIDTH);
  });

  it("replaces non-finite input with the default", () => {
    expect(clampFileExplorerWidth(Number.NaN, 444)).toBe(FILE_EXPLORER_DEFAULT_WIDTH);
  });
});

describe("resizeFileExplorerWidthFromKey", () => {
  const base = { shiftKey: false, currentWidth: 256, maxWidth: 444 };

  it("grows on ArrowLeft and shrinks on ArrowRight", () => {
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "ArrowLeft" })).toBe(272);
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "ArrowRight" })).toBe(240);
  });

  it("takes bigger steps with Shift", () => {
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "ArrowLeft", shiftKey: true })).toBe(320);
  });

  it("jumps to the bounds on Home and End", () => {
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "Home" })).toBe(FILE_EXPLORER_MIN_WIDTH);
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "End" })).toBe(444);
  });

  it("clamps at the edges", () => {
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "ArrowLeft", currentWidth: 440 })).toBe(
      444,
    );
  });

  it("ignores other keys", () => {
    expect(resizeFileExplorerWidthFromKey({ ...base, key: "Enter" })).toBeNull();
  });
});
