import { describe, expect, it } from "vite-plus/test";

import * as ThreadUndo from "./threadUndo";

describe("threadUndo claims", () => {
  it("keeps a fresh claim current until it is finished", () => {
    const claim = ThreadUndo.begin("archive", "env:thread-a");
    expect(claim.isCurrent()).toBe(true);
    claim.finish();
    expect(claim.isCurrent()).toBe(false);
  });

  it("expires an earlier claim when the same action kind is reclaimed", () => {
    const first = ThreadUndo.begin("archive", "env:thread-b");
    const second = ThreadUndo.begin("archive", "env:thread-b");
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
  });

  it("leaves unrelated action kinds intact", () => {
    const archive = ThreadUndo.begin("archive", "env:thread-c");
    ThreadUndo.begin("snooze", "env:thread-c");
    expect(archive.isCurrent()).toBe(true);
  });

  it("invalidate expires only the matching claim", () => {
    const claim = ThreadUndo.begin("snooze", "env:thread-d");
    ThreadUndo.invalidate("snooze", "env:thread-d");
    expect(claim.isCurrent()).toBe(false);
  });
});
