import type { ProviderQuotaSnapshot, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatQuotaCost,
  formatQuotaSummaryLine,
  formatResetsIn,
  isQuotaAlarming,
  orderQuotaWindows,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
  selectProviderInstanceLabel,
  selectProviderQuota,
} from "./providerQuota";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

const quota = (windows: ProviderQuotaSnapshot["windows"]): ProviderQuotaSnapshot => ({
  windows,
  capturedAt: "2026-07-29T12:00:00.000Z",
});

const provider = (input: {
  readonly instanceId: string;
  readonly displayName?: string;
  readonly quota?: ProviderQuotaSnapshot;
}) =>
  ({
    instanceId: input.instanceId,
    driver: "codex",
    ...(input.displayName ? { displayName: input.displayName } : {}),
    enabled: true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-07-29T12:00:00.000Z",
    models: [],
    slashCommands: [],
    skills: [],
    ...(input.quota ? { quota: input.quota } : {}),
  }) as unknown as ServerProvider;

describe("selectProviderQuota", () => {
  const providers = [
    provider({
      instanceId: "codex_work",
      quota: quota([{ id: "secondary", label: "Weekly", usedPercent: 62 }]),
    }),
    provider({
      instanceId: "codex_personal",
      quota: quota([{ id: "secondary", label: "Weekly", usedPercent: 8 }]),
    }),
  ];

  it("keeps two instances of the same driver on their own allowances", () => {
    expect(selectProviderQuota(providers, "codex_work")?.windows[0]?.usedPercent).toBe(62);
    expect(selectProviderQuota(providers, "codex_personal")?.windows[0]?.usedPercent).toBe(8);
  });

  it("returns null for an unknown or absent instance", () => {
    expect(selectProviderQuota(providers, "opencode")).toBeNull();
    expect(selectProviderQuota(providers, null)).toBeNull();
  });

  it("treats an empty window set as nothing to show", () => {
    const empty = [provider({ instanceId: "grok", quota: quota([]) })];
    expect(selectProviderQuota(empty, "grok")).toBeNull();
  });

  it("returns null for a provider that reports no quota at all", () => {
    expect(selectProviderQuota([provider({ instanceId: "opencode" })], "opencode")).toBeNull();
  });
});

describe("selectProviderInstanceLabel", () => {
  it("prefers the instance's own display name", () => {
    const providers = [provider({ instanceId: "codex_work", displayName: "Work Codex" })];
    expect(selectProviderInstanceLabel(providers, "codex_work")).toBe("Work Codex");
  });

  it("falls back to the instance id so two instances stay distinguishable", () => {
    const providers = [provider({ instanceId: "codex_personal" })];
    expect(selectProviderInstanceLabel(providers, "codex_personal")).toBe("codex_personal");
  });
});

describe("formatResetsIn", () => {
  it.each([
    ["2026-07-29T12:00:30.000Z", "resets in under a minute"],
    ["2026-07-29T12:45:00.000Z", "resets in 45m"],
    ["2026-07-29T15:00:00.000Z", "resets in 3h"],
    ["2026-07-29T15:20:00.000Z", "resets in 3h 20m"],
    ["2026-08-01T12:00:00.000Z", "resets in 3d"],
    ["2026-08-01T16:00:00.000Z", "resets in 3d 4h"],
  ])("formats %s as %s", (resetsAt, expected) => {
    expect(formatResetsIn(resetsAt, NOW)).toBe(expected);
  });

  it("reports a past reset as due now rather than a negative duration", () => {
    expect(formatResetsIn("2026-07-29T11:00:00.000Z", NOW)).toBe("resets now");
  });

  it("returns null when the provider gave no reset time", () => {
    expect(formatResetsIn(undefined, NOW)).toBeNull();
    expect(formatResetsIn("not-a-date", NOW)).toBeNull();
  });
});

describe("orderQuotaWindows", () => {
  it("puts the most-constrained window first", () => {
    const ordered = orderQuotaWindows([
      { id: "a", label: "5-hour", usedPercent: 12 },
      { id: "b", label: "Weekly", usedPercent: 88 },
      { id: "c", label: "Overage", usedPercent: 40 },
    ]);

    expect(ordered.map((entry) => entry.label)).toEqual(["Weekly", "Overage", "5-hour"]);
  });
});

describe("formatQuotaSummaryLine", () => {
  it("names the window that will bite first, phrased as remaining", () => {
    expect(
      formatQuotaSummaryLine(
        quota([
          { id: "a", label: "5-hour", usedPercent: 12 },
          { id: "b", label: "Weekly", usedPercent: 62, resetsAt: "2026-08-01T16:00:00.000Z" },
        ]),
        NOW,
      ),
    ).toBe("Weekly 38% left · resets in 3d 4h");
  });

  it("omits the reset clause when the provider did not report one", () => {
    expect(formatQuotaSummaryLine(quota([{ id: "a", label: "Weekly", usedPercent: 5 }]), NOW)).toBe(
      "Weekly 95% left",
    );
  });

  it("returns null when there is no quota to summarize", () => {
    expect(formatQuotaSummaryLine(null, NOW)).toBeNull();
    expect(formatQuotaSummaryLine(quota([]), NOW)).toBeNull();
  });
});

describe("quotaRemainingPercent", () => {
  it.each([
    [0, 100],
    [62, 38],
    [100, 0],
  ])("turns %s%% used into %s%% remaining", (used, expected) => {
    expect(quotaRemainingPercent({ id: "a", label: "a", usedPercent: used })).toBe(expected);
  });
});

describe("quota colour ramp", () => {
  it("is bright green when full and bright red when empty", () => {
    expect(quotaRemainingColor(100)).toBe("hsl(140.0 90% 50%)");
    expect(quotaRemainingColor(0)).toBe("hsl(0.0 90% 50%)");
  });

  it("passes through yellow rather than brown in the midrange", () => {
    // A straight green→red RGB blend muddies here; sweeping hue keeps it clean.
    const hue = Number(/hsl\(([\d.]+)/.exec(quotaRemainingColor(43))?.[1]);
    expect(hue).toBeGreaterThan(55);
    expect(hue).toBeLessThan(65);
  });

  it("descends monotonically from green to red", () => {
    const hues = [100, 75, 50, 25, 0].map((remaining) =>
      Number(/hsl\(([\d.]+)/.exec(quotaRemainingColor(remaining))?.[1]),
    );
    expect(hues).toEqual([...hues].sort((left, right) => right - left));
  });

  it("builds a vertical gradient sharing the level's hue", () => {
    const gradient = quotaRemainingGradient(100);
    expect(gradient).toContain("linear-gradient(to bottom");
    expect(gradient.match(/hsl\(140\.0/g)).toHaveLength(2);
  });
});

describe("isQuotaAlarming", () => {
  it("trusts the provider when it says a window is exhausted, whatever the percentage", () => {
    expect(
      isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 40, exhausted: true }),
    ).toBe(true);
  });

  it("trusts a snapshot-level exhausted status", () => {
    const exhausted: ProviderQuotaSnapshot = { ...quota([]), status: "exhausted" };
    expect(isQuotaAlarming(exhausted, { id: "a", label: "Weekly", usedPercent: 3 })).toBe(true);
  });

  it("warns on its own once past the threshold", () => {
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 91 })).toBe(true);
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 90 })).toBe(false);
  });

  it("stays calm at comfortable usage", () => {
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 12 })).toBe(false);
  });
});

describe("formatQuotaCost", () => {
  it("renders an em dash when the provider does not report spend", () => {
    // Not "$0.00": Codex reports nothing, and claiming zero would read as free.
    expect(formatQuotaCost(null)).toBe("—");
    expect(formatQuotaCost(undefined)).toBe("—");
  });

  it("keeps tiny non-zero spend visible", () => {
    expect(formatQuotaCost(0.004)).toBe("<$0.01");
  });

  it("formats ordinary amounts to cents", () => {
    expect(formatQuotaCost(0)).toBe("$0.00");
    expect(formatQuotaCost(12.3456)).toBe("$12.35");
  });
});
