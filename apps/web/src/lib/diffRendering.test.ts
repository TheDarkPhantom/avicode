import { describe, expect, it } from "vite-plus/test";
import { buildPatchCacheKey, getDiffLineStat, getRenderablePatch } from "./diffRendering";

describe("buildPatchCacheKey", () => {
  it("returns a stable cache key for identical content", () => {
    const patch = "diff --git a/a.ts b/a.ts\n+console.log('hello')";

    expect(buildPatchCacheKey(patch)).toBe(buildPatchCacheKey(patch));
  });

  it("changes when diff content changes", () => {
    const before = "diff --git a/a.ts b/a.ts\n+console.log('hello')";
    const after = "diff --git a/a.ts b/a.ts\n+console.log('hello world')";

    expect(buildPatchCacheKey(before)).not.toBe(buildPatchCacheKey(after));
  });

  it("changes when cache scope changes", () => {
    const patch = "diff --git a/a.ts b/a.ts\n+console.log('hello')";

    expect(buildPatchCacheKey(patch, "diff-panel:light")).not.toBe(
      buildPatchCacheKey(patch, "diff-panel:dark"),
    );
  });
});

describe("getRenderablePatch", () => {
  it("compacts partial hunk render offsets for virtualized review diffs", () => {
    const patch = [
      "diff --git a/example.ts b/example.ts",
      "index 1111111..2222222 100644",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -48,4 +48,4 @@",
      " context",
      "-before",
      "+after",
      " context",
      " context",
      "@@ -80,3 +80,4 @@",
      " context",
      "+added",
      " context",
      " context",
    ].join("\n");

    const parsed = getRenderablePatch(patch, "review", {
      compactPartialHunkOffsets: true,
    });
    expect(parsed?.kind).toBe("files");
    if (parsed?.kind !== "files") return;

    const file = parsed.files[0];
    expect(file?.hunks[0]?.collapsedBefore).toBe(47);
    expect(file?.hunks[0]?.unifiedLineStart).toBe(0);
    expect(file?.hunks[1]?.collapsedBefore).toBeGreaterThan(0);
    expect(file?.hunks[1]?.unifiedLineStart).toBe(file?.hunks[0]?.unifiedLineCount);
    expect(file?.unifiedLineCount).toBe(
      file?.hunks.reduce((total, hunk) => total + hunk.unifiedLineCount, 0),
    );
  });

  it("retains source-file offsets for checkpoint diffs", () => {
    const patch = [
      "diff --git a/example.ts b/example.ts",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -48,1 +48,1 @@",
      "-before",
      "+after",
    ].join("\n");

    const parsed = getRenderablePatch(patch, "checkpoint");
    expect(parsed?.kind).toBe("files");
    if (parsed?.kind !== "files") return;
    expect(parsed.files[0]?.hunks[0]?.unifiedLineStart).toBe(47);
  });

  it("keeps whitespace at the end of the last hunk", () => {
    const patch = (lastLines: string[]) =>
      [
        "diff --git a/example.ts b/example.ts",
        "--- a/example.ts",
        "+++ b/example.ts",
        ...lastLines,
        "",
      ].join("\n");

    const trailing = getRenderablePatch(patch(["@@ -1 +1 @@", "-a", "+  b \t"]), "review");
    expect(trailing?.kind).toBe("files");
    if (trailing?.kind !== "files") return;
    expect(trailing.files[0]?.additionLines).toEqual(["  b \t\n"]);

    const blankContext = getRenderablePatch(patch(["@@ -1,2 +1,2 @@", "-a", "+b", " "]), "review");
    expect(blankContext?.kind).toBe("files");
    if (blankContext?.kind !== "files") return;
    expect(blankContext.files[0]?.additionLines).toEqual(["b\n", "\n"]);
    expect(blankContext.files[0]?.hunks[0]?.unifiedLineCount).toBe(3);

    expect(getRenderablePatch(" \n\t\n", "review")).toBeNull();
  });

  it("caches patches that differ only in trailing whitespace separately", () => {
    const patch = (added: string) =>
      [
        "diff --git a/example.ts b/example.ts",
        "--- a/example.ts",
        "+++ b/example.ts",
        "@@ -1 +1 @@",
        "-a",
        `+${added}`,
        "",
      ].join("\n");

    const plain = getRenderablePatch(patch("b"), "review");
    const tabbed = getRenderablePatch(patch("b\t"), "review");
    expect(plain?.kind).toBe("files");
    expect(tabbed?.kind).toBe("files");
    if (plain?.kind !== "files" || tabbed?.kind !== "files") return;
    expect(tabbed.files[0]?.cacheKey).not.toBe(plain.files[0]?.cacheKey);
  });
});

describe("getDiffLineStat", () => {
  it("totals additions and deletions across every file and hunk", () => {
    const patch = [
      "diff --git a/example.ts b/example.ts",
      "--- a/example.ts",
      "+++ b/example.ts",
      "@@ -1,2 +1,3 @@",
      "-before",
      "+after",
      "+added",
      " context",
      "@@ -10,2 +11,1 @@",
      "-removed",
      " context",
      "diff --git a/README.md b/README.md",
      "--- a/README.md",
      "+++ b/README.md",
      "@@ -1 +1,2 @@",
      " title",
      "+description",
    ].join("\n");

    const parsed = getRenderablePatch(patch);
    expect(parsed?.kind).toBe("files");
    if (parsed?.kind !== "files") return;

    expect(getDiffLineStat(parsed.files)).toEqual({ additions: 3, deletions: 2 });
  });
});
