import { describe, expect, it } from "vite-plus/test";

import {
  getIconAdjacentModelName,
  getTriggerDisplayModelName,
  stripRedundantVendorPrefix,
} from "./providerIconUtils";

describe("stripRedundantVendorPrefix", () => {
  it("drops the Claude vendor word from the shipped Claude model names", () => {
    expect(stripRedundantVendorPrefix("Claude Opus 5")).toBe("Opus 5");
    expect(stripRedundantVendorPrefix("Claude Fable 5")).toBe("Fable 5");
    expect(stripRedundantVendorPrefix("Claude Sonnet 4.6")).toBe("Sonnet 4.6");
    expect(stripRedundantVendorPrefix("Claude Haiku 4.5")).toBe("Haiku 4.5");
  });

  it("keeps the vendor word when the remainder is a bare version number", () => {
    // Not a name that ships today, but stripping it would render as "4.5" and
    // leave the row meaningless.
    expect(stripRedundantVendorPrefix("Claude 4.5")).toBe("Claude 4.5");
  });

  it("leaves names that carry no redundant vendor word alone", () => {
    expect(stripRedundantVendorPrefix("GPT-5.1 Codex")).toBe("GPT-5.1 Codex");
    expect(stripRedundantVendorPrefix("Grok 4")).toBe("Grok 4");
    expect(stripRedundantVendorPrefix("Opus 4.6")).toBe("Opus 4.6");
  });

  it("only strips a leading vendor word, never one mid-name", () => {
    expect(stripRedundantVendorPrefix("Cursor Claude Opus")).toBe("Cursor Claude Opus");
  });
});

describe("getIconAdjacentModelName", () => {
  it("strips the vendor word after the existing sub-provider qualifier", () => {
    expect(
      getIconAdjacentModelName({
        slug: "claude-opus-5",
        name: "Anthropic: Claude Opus 5",
        subProvider: "Anthropic",
      }),
    ).toBe("Opus 5");
  });

  it("prefers the short name the same way the untouched trigger label does", () => {
    const model = { slug: "claude-opus-5", name: "Claude Opus 5", shortName: "Claude Opus 5 Fast" };
    expect(getIconAdjacentModelName(model)).toBe("Opus 5 Fast");
    expect(getTriggerDisplayModelName(model)).toBe("Claude Opus 5 Fast");
  });
});
