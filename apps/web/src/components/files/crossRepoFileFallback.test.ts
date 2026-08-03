import { describe, expect, it } from "vite-plus/test";

import { resolveCrossRepoFileFallback } from "./crossRepoFileFallback";

const THREAD_ROOT = "C:\\Users\\avi-r\\Dropbox\\dev\\advisoravi-business";
const PROJECTS = [
  "C:\\Users\\avi-r\\Dropbox\\dev\\advisoravi-business",
  "C:\\Users\\avi-r\\Dropbox\\dev\\ALFRED-CODE",
  "C:\\Users\\avi-r\\Dropbox\\dev\\avicode",
];

describe("resolveCrossRepoFileFallback", () => {
  it("finds the repo a path written from the folder above the thread belongs to", () => {
    // The reported failure verbatim: the link read as
    // 'dev/ALFRED-CODE/docs/RECORDINGS_COLLECTOR_SETUP.md' and the viewer tried
    // it inside advisoravi-business.
    expect(
      resolveCrossRepoFileFallback(
        THREAD_ROOT,
        "dev/ALFRED-CODE/docs/RECORDINGS_COLLECTOR_SETUP.md",
        PROJECTS,
      ),
    ).toEqual({
      root: "C:\\Users\\avi-r\\Dropbox\\dev\\ALFRED-CODE",
      relativePath: "docs/RECORDINGS_COLLECTOR_SETUP.md",
    });
  });

  it("resolves a sibling repo named from the thread's immediate parent", () => {
    expect(resolveCrossRepoFileFallback(THREAD_ROOT, "avicode/AGENTS.md", PROJECTS)).toEqual({
      root: "C:\\Users\\avi-r\\Dropbox\\dev\\avicode",
      relativePath: "AGENTS.md",
    });
  });

  it("never answers with the thread's own workspace", () => {
    // Resolving there is exactly what failed, so offering it back would loop.
    expect(
      resolveCrossRepoFileFallback(THREAD_ROOT, "advisoravi-business/docs/x.md", PROJECTS),
    ).toBeNull();
  });

  it("stays silent when no registered project owns the path", () => {
    expect(resolveCrossRepoFileFallback(THREAD_ROOT, "docs/missing.md", PROJECTS)).toBeNull();
    expect(
      resolveCrossRepoFileFallback(THREAD_ROOT, "dev/SOME-OTHER-REPO/readme.md", PROJECTS),
    ).toBeNull();
  });

  it("prefers the deepest ancestor, so the nearest repo wins", () => {
    // Both `<parent>/shared/x.md` and `<grandparent>/dev/shared/x.md` name a
    // registered project; the one closer to the thread is the better guess.
    const projects = [
      "C:\\Users\\avi-r\\Dropbox\\dev\\shared",
      "C:\\Users\\avi-r\\Dropbox\\shared",
    ];
    expect(resolveCrossRepoFileFallback(THREAD_ROOT, "shared/x.md", projects)).toEqual({
      root: "C:\\Users\\avi-r\\Dropbox\\dev\\shared",
      relativePath: "x.md",
    });
  });

  it("prefers the most specific project when one nests inside another", () => {
    const projects = [
      "C:\\Users\\avi-r\\Dropbox\\dev\\monorepo",
      "C:\\Users\\avi-r\\Dropbox\\dev\\monorepo\\packages\\ui",
    ];
    expect(
      resolveCrossRepoFileFallback(THREAD_ROOT, "monorepo/packages/ui/src/button.tsx", projects),
    ).toEqual({
      root: "C:\\Users\\avi-r\\Dropbox\\dev\\monorepo\\packages\\ui",
      relativePath: "src/button.tsx",
    });
  });

  it("works with posix roots as well as Windows ones", () => {
    expect(
      resolveCrossRepoFileFallback("/home/avi/dev/business", "dev/alfred/docs/x.md", [
        "/home/avi/dev/alfred",
      ]),
    ).toEqual({ root: "/home/avi/dev/alfred", relativePath: "docs/x.md" });
  });

  it("refuses to anchor on the filesystem or drive root", () => {
    // "Users/avi-r/..." resolving from "C:/" would match anything on the drive
    // and is not a folder anyone writes a path relative to.
    expect(
      resolveCrossRepoFileFallback(
        "C:\\Users\\avi-r",
        "Users/avi-r/Dropbox/dev/ALFRED-CODE/docs/x.md",
        PROJECTS,
      ),
    ).toBeNull();
  });

  it("takes an empty root or path as no answer", () => {
    expect(resolveCrossRepoFileFallback("", "docs/x.md", PROJECTS)).toBeNull();
    expect(resolveCrossRepoFileFallback(THREAD_ROOT, "", PROJECTS)).toBeNull();
  });
});
