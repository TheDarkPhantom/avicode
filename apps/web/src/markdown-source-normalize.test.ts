import { describe, expect, it } from "vite-plus/test";

import { normalizeOrderedListContinuations } from "./markdown-source-normalize";

describe("normalizeOrderedListContinuations", () => {
  it("inserts a blank line before a numbered continuation after a paragraph", () => {
    const source = "**Standup, rebuilt**\n6. Rebuilt the board\n7. Added drawers";
    const { text } = normalizeOrderedListContinuations(source);
    expect(text).toBe("**Standup, rebuilt**\n\n6. Rebuilt the board\n7. Added drawers");
  });

  it("leaves a list that already starts at 1 untouched", () => {
    const source = "Here are the changes:\n1. First\n2. Second";
    const result = normalizeOrderedListContinuations(source);
    expect(result.text).toBe(source);
    // No insertions means the identity offset mapping.
    expect(result.mapOffset(7)).toBe(7);
  });

  it("does not touch an ordered marker after a blank line or another list item", () => {
    const spaced = "Intro\n\n6. Already a list";
    expect(normalizeOrderedListContinuations(spaced).text).toBe(spaced);

    const afterItem = "1. First\n2. Second";
    expect(normalizeOrderedListContinuations(afterItem).text).toBe(afterItem);
  });

  it("does not touch an ordered marker after an ATX heading", () => {
    const source = "# Heading\n6. Already interrupts";
    expect(normalizeOrderedListContinuations(source).text).toBe(source);
  });

  it("leaves ordered-looking lines inside a fenced code block alone", () => {
    const source = "Intro\n```\n6. not a list\n```";
    expect(normalizeOrderedListContinuations(source).text).toBe(source);
  });

  it("maps a post-insertion offset back to the original source", () => {
    const source = "Intro\n6. a";
    const { text, mapOffset } = normalizeOrderedListContinuations(source);
    // Normalized gains one newline: the marker shifts from index 6 to 7.
    expect(text.indexOf("6.")).toBe(7);
    expect(source.indexOf("6.")).toBe(6);
    expect(mapOffset(7)).toBe(6);
    // Offsets before the insertion are unchanged.
    expect(mapOffset(0)).toBe(0);
  });

  it("handles multiple continuations independently", () => {
    const source = "**A**\n2. a\nmiddle text\n5. b";
    const { text } = normalizeOrderedListContinuations(source);
    expect(text).toBe("**A**\n\n2. a\nmiddle text\n\n5. b");
  });
});
