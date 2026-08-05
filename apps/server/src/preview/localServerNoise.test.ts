import { describe, expect, it } from "vite-plus/test";

import { filterBrowsableLocalServers, isBrowsableLocalServer } from "./localServerNoise.ts";

const candidate = (
  port: number,
  processName: string | null = null,
  terminal: unknown = null,
): { port: number; processName: string | null; terminal: unknown } => ({
  port,
  processName,
  terminal,
});

const owned = { threadId: "t1", terminalId: "term-1" };

describe("isBrowsableLocalServer", () => {
  it("keeps anything an Avi Code terminal started, wherever it listens", () => {
    // Ownership is the whole rule, so it has to hold on ports and process names
    // that no heuristic would have accepted.
    expect(isBrowsableLocalServer(candidate(5173, "node", owned))).toBe(true);
    expect(isBrowsableLocalServer(candidate(51733, "node", owned))).toBe(true);
    expect(isBrowsableLocalServer(candidate(80, "node", owned))).toBe(true);
    expect(isBrowsableLocalServer(candidate(49664, "lsass", owned))).toBe(true);
    expect(isBrowsableLocalServer(candidate(4321, null, owned))).toBe(true);
  });

  it("drops the vendor tools that filled the panel", () => {
    // Every one of these was listed in a reported screenshot, and two of them
    // really do serve HTTP, so only provenance tells them apart from a dev server.
    for (const [port, name] of [
      [5600, "aw-server"],
      [6850, "AacAmbientLighting"],
      [9012, "ArmourySocketServer"],
      [9014, "ArmouryHtmlDebugServer"],
      [9180, "lghub_updater"],
      [9247, "nordvpn-service"],
      [13030, "ROGLiveService"],
      [22112, "ROGLiveService"],
    ] as const) {
      expect(isBrowsableLocalServer(candidate(port, name)), `${name}:${port}`).toBe(false);
    }
  });

  it("drops an unowned listener even on a classic dev port", () => {
    // The previous blocklist kept these, which is how the vendor tools got in.
    expect(isBrowsableLocalServer(candidate(5173, "node"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(3000, "node"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(8080, "python"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(4321, null))).toBe(false);
  });

  it("treats a missing owner the same as an absent one", () => {
    expect(isBrowsableLocalServer({ terminal: undefined })).toBe(false);
  });
});

describe("filterBrowsableLocalServers", () => {
  it("reduces a realistic Windows scan to the servers Avi Code started", () => {
    const scanned = [
      candidate(5600, "aw-server"),
      candidate(9014, "ArmouryHtmlDebugServer"),
      candidate(5733, "node", owned),
      candidate(9247, "nordvpn-service"),
      candidate(49664, "lsass"),
      candidate(61845, "bun", owned),
    ];

    expect(filterBrowsableLocalServers(scanned).map((server) => server.port)).toEqual([
      5733, 61845,
    ]);
  });
});
