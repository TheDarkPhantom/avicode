import { describe, expect, it } from "vite-plus/test";

import type { LocalServerGroup, LocalServerSection } from "./localServerAttribution";
import type { PreviewableServer } from "./useDiscoveredLocalServers";
import { hasScopedDevServer, shouldOfferStartDevServer } from "./startDevServer.logic";

const fakeServer = {} as PreviewableServer;

function section(group: LocalServerGroup, count: number): LocalServerSection {
  return {
    group,
    title: group,
    servers: Array.from({ length: count }, () => fakeServer),
  };
}

describe("hasScopedDevServer", () => {
  it("worktree threads only count their own thread's server", () => {
    expect(hasScopedDevServer([section("this-thread", 1)], "/wt")).toBe(true);
    expect(hasScopedDevServer([section("this-project", 1)], "/wt")).toBe(false);
    expect(hasScopedDevServer([section("other", 1)], "/wt")).toBe(false);
  });

  it("local threads reuse any server owned by the project", () => {
    expect(hasScopedDevServer([section("this-project", 1)], null)).toBe(true);
    expect(hasScopedDevServer([section("this-thread", 1)], null)).toBe(true);
    expect(hasScopedDevServer([section("other", 1)], null)).toBe(false);
    expect(hasScopedDevServer([section("recent", 1)], null)).toBe(false);
  });

  it("ignores empty sections", () => {
    expect(hasScopedDevServer([section("this-thread", 0)], "/wt")).toBe(false);
  });
});

describe("shouldOfferStartDevServer", () => {
  it("offers a start only when one can start and none is in scope", () => {
    expect(shouldOfferStartDevServer({ sections: [], worktreePath: "/wt", canStart: true })).toBe(
      true,
    );
    expect(shouldOfferStartDevServer({ sections: [], worktreePath: "/wt", canStart: false })).toBe(
      false,
    );
    expect(
      shouldOfferStartDevServer({
        sections: [section("this-thread", 1)],
        worktreePath: "/wt",
        canStart: true,
      }),
    ).toBe(false);
  });

  it("keeps offering in a worktree even when a sibling project server is up", () => {
    expect(
      shouldOfferStartDevServer({
        sections: [section("this-project", 1)],
        worktreePath: "/wt",
        canStart: true,
      }),
    ).toBe(true);
  });
});
