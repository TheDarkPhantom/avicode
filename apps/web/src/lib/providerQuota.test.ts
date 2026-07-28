import type { ProviderQuotaSnapshot, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatQuotaCost,
  formatQuotaSummaryLine,
  formatResetsIn,
  isQuotaAlarming,
  orderQuotaWindows,
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
  it("names the window that will bite first", () => {
    expect(
      formatQuotaSummaryLine(
        quota([
          { id: "a", label: "5-hour", usedPercent: 12 },
          { id: "b", label: "Weekly", usedPercent: 62, resetsAt: "2026-08-01T16:00:00.000Z" },
        ]),
        NOW,
      ),
    ).toBe("Weekly 62% · resets in 3d 4h");
  });

  it("omits the reset clause when the provider did not report one", () => {
    expect(formatQuotaSummaryLine(quota([{ id: "a", label: "Weekly", usedPercent: 5 }]), NOW)).toBe(
      "Weekly 5%",
    );
  });

  it("returns null when there is no quota to summarize", () => {
    expect(formatQuotaSummaryLine(null, NOW)).toBeNull();
    expect(formatQuotaSummaryLine(quota([]), NOW)).toBeNull();
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
