import { describe, expect, it } from "vite-plus/test";

import { isWindowActive, type WindowActivityDocument } from "./useWindowActive";

function doc(input: {
  visibilityState: DocumentVisibilityState;
  hasFocus: boolean;
}): WindowActivityDocument {
  return {
    visibilityState: input.visibilityState,
    hasFocus: () => input.hasFocus,
  };
}

describe("isWindowActive", () => {
  it("is active only when the window is both visible and focused", () => {
    expect(isWindowActive(doc({ visibilityState: "visible", hasFocus: true }))).toBe(true);
  });

  it("is inactive for a background tab", () => {
    expect(isWindowActive(doc({ visibilityState: "hidden", hasFocus: false }))).toBe(false);
  });

  // The case the sidebar unread indicator depends on: a desktop window behind
  // the user's editor still reports "visible", so visibility alone would treat
  // an agent finishing while the user is away as work they already saw.
  it("is inactive for a visible but unfocused window", () => {
    expect(isWindowActive(doc({ visibilityState: "visible", hasFocus: false }))).toBe(false);
  });
});
