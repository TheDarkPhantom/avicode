import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { findScopedDevServer } from "./startDevServer.logic";

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
