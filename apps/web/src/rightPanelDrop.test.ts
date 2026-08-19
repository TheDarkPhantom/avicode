import { describe, expect, it } from "vite-plus/test";

import { exceedsDragThreshold, isRightHalfDrop } from "./rightPanelDrop";
import { canSplitPreview, type RightPanelSurface } from "./rightPanelStore";

const preview = (tabId: string, secondaryTabId?: string): RightPanelSurface => ({
  id: `browser:${tabId}`,
  kind: "preview",
  resourceId: tabId,
  ...(secondaryTabId ? { secondaryTabId } : {}),
});
const previewPlaceholder: RightPanelSurface = {
  id: "browser:new",
  kind: "preview",
  resourceId: null,
};
const diff: RightPanelSurface = { id: "diff", kind: "diff" };

describe("isRightHalfDrop", () => {
  const rect = { left: 100, width: 200 }; // midpoint at x=200

  it("is true at and past the midpoint", () => {
    expect(isRightHalfDrop(200, rect)).toBe(true);
    expect(isRightHalfDrop(260, rect)).toBe(true);
  });

  it("is false left of the midpoint", () => {
    expect(isRightHalfDrop(199, rect)).toBe(false);
    expect(isRightHalfDrop(100, rect)).toBe(false);
  });
});

describe("exceedsDragThreshold", () => {
  it("stays a click below the threshold and becomes a drag at it", () => {
    expect(exceedsDragThreshold(2, 2)).toBe(false);
    expect(exceedsDragThreshold(5, 0)).toBe(true);
  });
});

describe("canSplitPreview", () => {
  it("allows two distinct live previews", () => {
    expect(canSplitPreview(preview("a"), preview("b"))).toBe(true);
  });

  it("rejects splitting a preview into itself", () => {
    expect(canSplitPreview(preview("a"), preview("a"))).toBe(false);
  });

  it("rejects an already-split primary", () => {
    expect(canSplitPreview(preview("a", "c"), preview("b"))).toBe(false);
  });

  it("rejects placeholder or non-preview participants", () => {
    expect(canSplitPreview(previewPlaceholder, preview("b"))).toBe(false);
    expect(canSplitPreview(preview("a"), previewPlaceholder)).toBe(false);
    expect(canSplitPreview(diff, preview("b"))).toBe(false);
    expect(canSplitPreview(preview("a"), diff)).toBe(false);
    expect(canSplitPreview(null, preview("b"))).toBe(false);
  });
});
