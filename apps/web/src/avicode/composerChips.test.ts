import { describe, expect, it } from "vite-plus/test";

import {
  chipDotClass,
  nextChipId,
  sameChips,
  shouldShowComposerChips,
  type ComposerChipVisibilityInput,
} from "./composerChips";

const sendable: ComposerChipVisibilityInput = {
  chipCount: 2,
  prompt: "",
  hasPendingApproval: false,
  pendingUserInputCount: 0,
  projectSelectionRequired: false,
  noProviderAvailable: false,
};

describe("shouldShowComposerChips", () => {
  it("shows on an empty composer that can send", () => {
    expect(shouldShowComposerChips(sendable)).toBe(true);
    expect(shouldShowComposerChips({ ...sendable, prompt: "  \n" })).toBe(true);
  });

  it("hides once the user types", () => {
    expect(shouldShowComposerChips({ ...sendable, prompt: "fix the build" })).toBe(false);
  });

  it("hides with no chips", () => {
    expect(shouldShowComposerChips({ ...sendable, chipCount: 0 })).toBe(false);
  });

  it("hides while an approval or a question is waiting", () => {
    expect(shouldShowComposerChips({ ...sendable, hasPendingApproval: true })).toBe(false);
    expect(shouldShowComposerChips({ ...sendable, pendingUserInputCount: 1 })).toBe(false);
  });

  it("hides without a project or a provider", () => {
    expect(shouldShowComposerChips({ ...sendable, projectSelectionRequired: true })).toBe(false);
    expect(shouldShowComposerChips({ ...sendable, noProviderAvailable: true })).toBe(false);
  });
});

describe("chipDotClass", () => {
  it("falls back to the default colour for an unknown token", () => {
    expect(chipDotClass("green")).toBe("bg-green-500");
    expect(chipDotClass("mauve")).toBe("bg-blue-500");
  });
});

describe("nextChipId", () => {
  it("slugs the label and avoids taken ids", () => {
    expect(nextChipId("PR merge!", [])).toBe("pr-merge");
    expect(nextChipId("pr merge", ["pr-merge", "pr-merge-2"])).toBe("pr-merge-3");
    expect(nextChipId("🚀", [])).toBe("chip");
  });
});

describe("sameChips", () => {
  const chip = { id: "a", label: "a", color: "blue", text: "a" };
  it("compares every field in order", () => {
    expect(sameChips([chip], [{ ...chip }])).toBe(true);
    expect(sameChips([chip], [{ ...chip, text: "b" }])).toBe(false);
    expect(sameChips([chip], [])).toBe(false);
  });
});
