import { describe, expect, it } from "vite-plus/test";

import { splitForMiddleTruncate } from "./middle-truncate";

describe("splitForMiddleTruncate", () => {
  it("keeps the meaningful tail of a long branch name", () => {
    const value = "fix/cache-main-20260918-180825";
    const split = splitForMiddleTruncate(value);
    expect(split).not.toBeNull();
    // Default keeps the trailing date that distinguishes similar branches.
    expect(split?.tail).toBe("918-180825");
    expect(`${split?.head}${split?.tail}`).toBe(value);
  });

  it("keeps a short last path segment intact", () => {
    const split = splitForMiddleTruncate("apps/web/src/index.ts");
    expect(split?.tail).toBe("index.ts");
  });

  it("does not split when the string is short enough to show whole", () => {
    expect(splitForMiddleTruncate("main")).toBeNull();
  });

  it("does not split inside a surrogate pair", () => {
    const split = splitForMiddleTruncate("😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀", 4);
    expect(split).not.toBeNull();
    expect(Array.from(split?.tail ?? "")).toHaveLength(4);
    expect(`${split?.head}${split?.tail}`).toBe("😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀");
  });
});
