import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { attributeLocalServer, groupLocalServers } from "./localServerAttribution";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

const THIS_THREAD = ThreadId.make("thread-1");
const OTHER_THREAD = ThreadId.make("thread-2");

const CONTEXT = {
  threadId: THIS_THREAD,
  projectRoot: "C:/Users/avi/dev/avicode",
  worktreePath: null,
};

function server(overrides: Partial<PreviewableServer> = {}): PreviewableServer {
  return {
    host: "localhost",
    port: 5173,
    url: "http://localhost:5173",
    processName: "node",
    pid: 1234,
    terminal: null,
    source: "scanner",
    listening: true,
    ...overrides,
  };
}

describe("attributeLocalServer", () => {
  it("recognises a server started from a terminal in this thread", () => {
    expect(
      attributeLocalServer(
        server({ terminal: { threadId: THIS_THREAD, terminalId: "t1" } }),
        CONTEXT,
      ),
    ).toBe("this-thread");
  });

  it("recognises a sibling thread on the same project by its folder", () => {
    expect(
      attributeLocalServer(
        server({
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t2",
            cwd: "C:/Users/avi/dev/avicode",
          },
        }),
        CONTEXT,
      ),
    ).toBe("this-project");
  });

  it("matches a worktree of the project as the project", () => {
    expect(
      attributeLocalServer(
        server({
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t2",
            cwd: "C:/Users/avi/dev/avicode/.claude/worktrees/feature",
          },
        }),
        CONTEXT,
      ),
    ).toBe("this-project");
  });

  it("matches when this thread is the worktree and the server came from the project root", () => {
    expect(
      attributeLocalServer(
        server({
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t2",
            cwd: "C:/Users/avi/dev/avicode",
          },
        }),
        {
          threadId: THIS_THREAD,
          projectRoot: null,
          worktreePath: "C:/Users/avi/dev/avicode/.claude/worktrees/feature",
        },
      ),
    ).toBe("this-project");
  });

  it("ignores separator and case differences on Windows", () => {
    expect(
      attributeLocalServer(
        server({
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t2",
            cwd: "c:\\Users\\avi\\dev\\AviCode\\apps\\web",
          },
        }),
        CONTEXT,
      ),
    ).toBe("this-project");
  });

  it("treats a URL configured on this project's scripts as the project's own", () => {
    expect(attributeLocalServer(server({ source: "configured", terminal: null }), CONTEXT)).toBe(
      "this-project",
    );
  });

  it("keeps a URL you opened by hand in its own group", () => {
    expect(attributeLocalServer(server({ source: "recent", terminal: null }), CONTEXT)).toBe(
      "recent",
    );
  });

  it("does not claim a server from an unrelated repo", () => {
    expect(
      attributeLocalServer(
        server({
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t2",
            cwd: "C:/Users/avi/dev/advisoravi-business",
          },
        }),
        CONTEXT,
      ),
    ).toBe("other");
  });
});

describe("groupLocalServers", () => {
  it("puts this thread first, then the project, then other projects, then history", () => {
    const sections = groupLocalServers(
      [
        server({ port: 3000, source: "recent", terminal: null }),
        server({
          port: 4000,
          terminal: {
            threadId: OTHER_THREAD,
            terminalId: "t3",
            cwd: "C:/Users/avi/dev/advisoravi-business",
          },
        }),
        server({
          port: 6006,
          terminal: { threadId: OTHER_THREAD, terminalId: "t2", cwd: "C:/Users/avi/dev/avicode" },
        }),
        server({ port: 5173, terminal: { threadId: THIS_THREAD, terminalId: "t1" } }),
      ],
      CONTEXT,
    );

    expect(sections.map((section) => section.group)).toEqual([
      "this-thread",
      "this-project",
      "other",
      "recent",
    ]);
    expect(sections[0]?.servers.map((entry) => entry.port)).toEqual([5173]);
    expect(sections[2]?.servers.map((entry) => entry.port)).toEqual([4000]);
    expect(sections[3]?.servers.map((entry) => entry.port)).toEqual([3000]);
  });

  it("drops empty sections so a single group needs no heading", () => {
    const sections = groupLocalServers(
      [server({ terminal: { threadId: THIS_THREAD, terminalId: "t1" } })],
      CONTEXT,
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.group).toBe("this-thread");
  });

  it("shows every server it was given", () => {
    // Whatever reaches the client is worth an entry; the filtering that keeps
    // the machine's own listeners out happens on the server.
    const servers = [
      server({ port: 3000, source: "recent", terminal: null }),
      server({ port: 8080, terminal: { threadId: THIS_THREAD, terminalId: "t1" } }),
    ];
    const total = groupLocalServers(servers, CONTEXT).flatMap((section) => section.servers);
    expect(total).toHaveLength(2);
  });
});
