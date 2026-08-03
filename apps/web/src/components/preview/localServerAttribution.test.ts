import { ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  attributeLocalServer,
  groupLocalServers,
  shouldExpandOtherServers,
} from "./localServerAttribution";
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

  it("leaves a server started outside the app unattributed rather than hidden", () => {
    expect(attributeLocalServer(server({ terminal: null }), CONTEXT)).toBe("other");
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
  it("puts this thread first, then the project, then everything else", () => {
    const sections = groupLocalServers(
      [
        server({ port: 3000, terminal: null }),
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
    ]);
    expect(sections[0]?.servers.map((entry) => entry.port)).toEqual([5173]);
    expect(sections[2]?.servers.map((entry) => entry.port)).toEqual([3000]);
  });

  it("drops empty sections so a single group needs no heading", () => {
    const sections = groupLocalServers([server({ terminal: null })], CONTEXT);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.group).toBe("other");
  });

  it("never hides a server it cannot attribute", () => {
    const servers = [
      server({ port: 3000, terminal: null }),
      server({ port: 8080, terminal: null }),
    ];
    const total = groupLocalServers(servers, CONTEXT).flatMap((section) => section.servers);
    expect(total).toHaveLength(2);
  });
});

describe("shouldExpandOtherServers", () => {
  const section = (group: "this-thread" | "this-project" | "other") => ({
    group,
    title: group,
    servers: [],
  });

  it("keeps unrelated listeners folded away when a relevant server exists", () => {
    // The whole point: this thread's dev server must not be pushed down the
    // list by a dozen vendor background apps.
    expect(shouldExpandOtherServers([section("this-thread"), section("other")])).toBe(false);
    expect(shouldExpandOtherServers([section("this-project"), section("other")])).toBe(false);
  });

  it("opens when there is nothing more relevant to show", () => {
    // Collapsing the only section would leave an apparently empty panel.
    expect(shouldExpandOtherServers([section("other")])).toBe(true);
    expect(shouldExpandOtherServers([])).toBe(true);
  });
});
