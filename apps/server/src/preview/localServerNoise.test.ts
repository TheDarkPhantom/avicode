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

describe("isBrowsableLocalServer", () => {
  it("keeps anything an Avi Code terminal started, wherever it listens", () => {
    // A dev server that landed in the ephemeral range is still ours, and the
    // owner rule has to beat every port heuristic below.
    expect(isBrowsableLocalServer(candidate(51733, "node", { threadId: "t1" }))).toBe(true);
    expect(isBrowsableLocalServer(candidate(80, "node", { threadId: "t1" }))).toBe(true);
    expect(isBrowsableLocalServer(candidate(49664, "lsass", { threadId: "t1" }))).toBe(true);
  });

  it("drops the operating system services that filled the panel", () => {
    // Every one of these was listed in the reported screenshot.
    for (const [port, name] of [
      [49664, "lsass"],
      [49665, "wininit"],
      [49666, "svchost"],
      [49668, "spoolsv"],
      [49669, "jhi_service"],
      [49679, "services"],
      [27339, "System"],
      [24830, "AsusSoftwareManager"],
      [27036, "steam"],
      [50923, "ArmouryCrateControlInterface"],
    ] as const) {
      expect(isBrowsableLocalServer(candidate(port, name)), `${name}:${port}`).toBe(false);
    }
  });

  it("keeps ordinary dev server ports", () => {
    expect(isBrowsableLocalServer(candidate(3000, "node"))).toBe(true);
    expect(isBrowsableLocalServer(candidate(5173, "node"))).toBe(true);
    expect(isBrowsableLocalServer(candidate(8080, "python"))).toBe(true);
    expect(isBrowsableLocalServer(candidate(13773, "node"))).toBe(true);
  });

  it("keeps an unrecognised process on a dev port", () => {
    // A blocklist must fail open: someone's hand-rolled server is worse to hide
    // than one extra row is to show.
    expect(isBrowsableLocalServer(candidate(4321, "my-weird-binary"))).toBe(true);
    expect(isBrowsableLocalServer(candidate(4321, null))).toBe(true);
  });

  it("drops privileged and ephemeral ports when nothing owns them", () => {
    expect(isBrowsableLocalServer(candidate(445, "System"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(135, null))).toBe(false);
    expect(isBrowsableLocalServer(candidate(54346, null))).toBe(false);
  });

  it("matches process names regardless of case or a .exe suffix", () => {
    expect(isBrowsableLocalServer(candidate(27036, "Steam.exe"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(27036, "STEAM"))).toBe(false);
    expect(isBrowsableLocalServer(candidate(27036, "  svchost.exe  "))).toBe(false);
  });
});

describe("filterBrowsableLocalServers", () => {
  it("reduces a realistic Windows scan to the one server worth opening", () => {
    const scanned = [
      candidate(24830, "AsusSoftwareManager"),
      candidate(27036, "steam"),
      candidate(49664, "lsass"),
      candidate(49666, "svchost"),
      candidate(5733, "node"),
      candidate(54360, "steam"),
    ];

    expect(filterBrowsableLocalServers(scanned).map((server) => server.port)).toEqual([5733]);
  });
});
