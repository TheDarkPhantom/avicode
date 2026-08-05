import { describe, expect, it } from "vite-plus/test";
import { capturePlanReadingAnchor, resolvePlanReadingScrollOffset } from "./planReadingState";

describe("plan reading state", () => {
  it("captures the first row intersecting the viewport", () => {
    expect(
      capturePlanReadingAnchor(250, [
        { rowId: "before", top: 0, height: 100 },
        { rowId: "plan", top: 200, height: 900 },
      ]),
    ).toEqual({ rowId: "plan", offsetWithinRow: 50 });
  });

  it("keeps a signed offset for bottom-aligned short content", () => {
    expect(capturePlanReadingAnchor(20, [{ rowId: "plan", top: 35, height: 100 }])).toEqual({
      rowId: "plan",
      offsetWithinRow: -15,
    });
  });

  it("ignores invalid measurements", () => {
    expect(capturePlanReadingAnchor(Number.NaN, [])).toBeNull();
    expect(
      capturePlanReadingAnchor(10, [{ rowId: "bad", top: Number.NaN, height: 20 }]),
    ).toBeNull();
  });

  it("restores by stable row id after new rows are appended", () => {
    expect(
      resolvePlanReadingScrollOffset({
        anchor: { rowId: "plan", offsetWithinRow: 50 },
        currentScroll: 100,
        rowViewportTop: 150,
        viewportTop: 50,
      }),
    ).toBe(250);
  });

  it("falls back when the anchor row is gone", () => {
    expect(
      resolvePlanReadingScrollOffset({
        anchor: { rowId: "plan", offsetWithinRow: Number.NaN },
        currentScroll: 0,
        rowViewportTop: 0,
        viewportTop: 0,
      }),
    ).toBeNull();
  });
});
