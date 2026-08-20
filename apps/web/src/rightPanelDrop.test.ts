import { describe, expect, it } from "vite-plus/test";

import { exceedsDragThreshold, isRightHalfDrop } from "./rightPanelDrop";
import {
  canSplitPreview,
  resolvePreviewSplitSecondary,
  type RightPanelSurface,
} from "./rightPanelStore";

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

describe("resolvePreviewSplitSecondary", () => {
  it("pairs a dragged background preview with the active preview", () => {
    const surfaces = [preview("a"), preview("b")];
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "browser:b")).toBe("b");
  });

  it("pairs the active tab itself with the other open preview", () => {
    const surfaces = [preview("a"), preview("b")];
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "browser:a")).toBe("b");
  });

  it("returns null when the active preview is the only one", () => {
    const surfaces = [preview("a"), diff];
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "browser:a")).toBeNull();
  });

  it("returns null when the active surface is not a preview", () => {
    const surfaces = [diff, preview("b")];
    expect(resolvePreviewSplitSecondary(surfaces, "diff", "browser:b")).toBeNull();
  });

  it("returns null when the active preview is already split", () => {
    const surfaces = [preview("a", "c"), preview("b")];
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "browser:b")).toBeNull();
  });

  it("returns null for a placeholder or non-preview dragged tab", () => {
    const surfaces = [preview("a"), previewPlaceholder, diff];
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "browser:new")).toBeNull();
    expect(resolvePreviewSplitSecondary(surfaces, "browser:a", "diff")).toBeNull();
  });
});
