import { describe, expect, it } from "vite-plus/test";

import { buildAncestorFileCandidates } from "./crossRepoFileFallback";

describe("buildAncestorFileCandidates", () => {
  it("builds the reported Windows candidate without searching the drive root", () => {
    const candidates = buildAncestorFileCandidates(
      "C:\\Users\\avi-r\\Dropbox\\dev\\advisoravi-business",
      "dev/ALFRED-CODE/docs/RECORDINGS_COLLECTOR_SETUP.md",
    );
    expect(candidates).toContain(
      "C:/Users/avi-r/Dropbox/dev/ALFRED-CODE/docs/RECORDINGS_COLLECTOR_SETUP.md",
    );
    expect(candidates).not.toContain(
      "C:/Users/avi-r/Dropbox/dev/advisoravi-business/dev/ALFRED-CODE/docs/RECORDINGS_COLLECTOR_SETUP.md",
    );
  });

  it("builds POSIX ancestor candidates", () => {
    expect(buildAncestorFileCandidates("/home/avi/dev/business", "dev/alfred/docs/x.md")).toContain(
      "/home/avi/dev/alfred/docs/x.md",
    );
  });

  it("takes an empty root or path as no candidates", () => {
    expect(buildAncestorFileCandidates("", "docs/x.md")).toEqual([]);
    expect(buildAncestorFileCandidates("/workspace", "")).toEqual([]);
  });
});
