import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { LocalServerGroup, LocalServerSection } from "./localServerAttribution";
import type { PreviewableServer } from "./useDiscoveredLocalServers";
import {
  findScopedDevServer,
  hasScopedDevServer,
  shouldOfferStartDevServer,
} from "./startDevServer.logic";

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

const THREAD_A = "thread-a" as ThreadId;
const THREAD_B = "thread-b" as ThreadId;

function server(
  port: number,
  terminal: { threadId: ThreadId; cwd?: string; worktreePath?: string } | null,
): DiscoveredLocalServer {
  return {
    host: "127.0.0.1",
    port,
    url: `http://localhost:${port}`,
    processName: null,
    pid: null,
    terminal: terminal
      ? {
          threadId: terminal.threadId,
          terminalId: "term",
          cwd: terminal.cwd ?? null,
          worktreePath: terminal.worktreePath ?? null,
        }
      : null,
  };
}

describe("findScopedDevServer", () => {
  it("prefers a server this thread started, in either mode", () => {
    const own = server(3000, { threadId: THREAD_A });
    expect(
      findScopedDevServer([own], { threadId: THREAD_A, projectRoot: "/proj", worktreePath: "/wt" }),
    ).toBe(own);
    expect(
      findScopedDevServer([own], { threadId: THREAD_A, projectRoot: "/proj", worktreePath: null }),
    ).toBe(own);
  });

  it("ignores a sibling's server for a worktree thread", () => {
    const sibling = server(3000, { threadId: THREAD_B, cwd: "/proj" });
    expect(
      findScopedDevServer([sibling], {
        threadId: THREAD_A,
        projectRoot: "/proj",
        worktreePath: "/wt",
      }),
    ).toBeNull();
  });

  it("reuses a sibling's project server for a local thread", () => {
    const sibling = server(3000, { threadId: THREAD_B, cwd: "/proj/sub" });
    expect(
      findScopedDevServer([sibling], {
        threadId: THREAD_A,
        projectRoot: "/proj",
        worktreePath: null,
      }),
    ).toBe(sibling);
  });

  it("does not reuse a server from an unrelated project", () => {
    const other = server(3000, { threadId: THREAD_B, cwd: "/elsewhere" });
    expect(
      findScopedDevServer([other], {
        threadId: THREAD_A,
        projectRoot: "/proj",
        worktreePath: null,
      }),
    ).toBeNull();
  });
});
