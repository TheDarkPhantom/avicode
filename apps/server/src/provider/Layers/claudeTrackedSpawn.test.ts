import { describe, expect, it } from "vite-plus/test";

import { makeTrackedClaudeSpawn } from "./claudeTrackedSpawn.ts";

describe("makeTrackedClaudeSpawn", () => {
  it("counts the CLI as an agent from spawn until it exits", async () => {
    const tracked: number[] = [];
    let released = 0;
    const spawn = makeTrackedClaudeSpawn((pid) => {
      tracked.push(pid);
      return () => {
        released += 1;
      };
    });

    const child = spawn({
      command: process.execPath,
      args: ["-e", "process.stdin.resume(); process.stdin.on('end', () => process.exit(0));"],
      env: { ...process.env },
      signal: new AbortController().signal,
    });
    const exited = new Promise<void>((resolve) => child.on("exit", () => resolve()));

    expect(tracked).toHaveLength(1);
    expect(tracked[0]).toBeGreaterThan(0);
    expect(released).toBe(0);
    child.stdin.end();
    await exited;
    expect(released).toBe(1);
  });

  it("tracks nothing when the CLI cannot start", async () => {
    let tracked = 0;
    const spawn = makeTrackedClaudeSpawn(() => {
      tracked += 1;
      return () => undefined;
    });
    const child = spawn({
      command: "definitely-not-a-claude-binary",
      args: [],
      env: { ...process.env },
      signal: new AbortController().signal,
    });
    await new Promise<void>((resolve) => child.on("error", () => resolve()));
    expect(tracked).toBe(0);
  });
});
