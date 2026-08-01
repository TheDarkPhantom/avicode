import type { ProviderQuotaSnapshot, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  formatQuotaConstraintHint,
  formatQuotaCost,
  formatQuotaSummaryLine,
  formatResetsIn,
  isQuotaAlarming,
  leastHeadroomQuotaWindow,
  orderQuotaWindows,
  quotaHeadroomPercent,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
  selectProviderInstanceLabel,
  selectProviderQuota,
  shouldRefreshProviderQuota,
} from "./providerQuota";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

const FIVE_HOUR_MINUTES = 5 * 60;
const WEEKLY_MINUTES = 7 * 24 * 60;

const at = (offsetMs: number) => new Date(NOW + offsetMs).toISOString();
const hours = (count: number) => count * 60 * 60 * 1_000;

/**
 * The reading from the bug report: a weekly cap that looks alarming until you
 * notice it rolls over tomorrow, next to the 5-hour window that actually
 * governs the next few hours.
 */
const REPORTED_WINDOWS = [
  {
    id: "five_hour",
    label: "5-hour",
    usedPercent: 11,
    windowMinutes: FIVE_HOUR_MINUTES,
    resetsAt: at(hours(4) + 3 * 60 * 1_000),
  },
  {
    id: "seven_day",
    label: "Weekly",
    usedPercent: 62,
    windowMinutes: WEEKLY_MINUTES,
    resetsAt: at(hours(26)),
  },
] as const;

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

describe("shouldRefreshProviderQuota", () => {
  it("refreshes missing or stale provider usage but keeps a recent snapshot", () => {
    const now = Date.parse("2026-07-29T12:05:00.000Z");
    expect(shouldRefreshProviderQuota(null, now)).toBe(true);
    expect(
      shouldRefreshProviderQuota(
        { ...quota([{ id: "weekly", label: "Weekly", usedPercent: 20 }]), capturedAt: "bad" },
        now,
      ),
    ).toBe(true);
    expect(
      shouldRefreshProviderQuota(
        {
          ...quota([{ id: "weekly", label: "Weekly", usedPercent: 20 }]),
          capturedAt: "2026-07-29T12:04:00.000Z",
        },
        now,
      ),
    ).toBe(false);
    expect(
      shouldRefreshProviderQuota(
        {
          ...quota([{ id: "weekly", label: "Weekly", usedPercent: 20 }]),
          capturedAt: "2026-07-29T12:00:00.000Z",
        },
        now,
      ),
    ).toBe(true);
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
    const ordered = orderQuotaWindows(
      [
        { id: "a", label: "5-hour", usedPercent: 12 },
        { id: "b", label: "Weekly", usedPercent: 88 },
        { id: "c", label: "Overage", usedPercent: 40 },
      ],
      NOW,
    );

    expect(ordered.map((entry) => entry.label)).toEqual(["Weekly", "Overage", "5-hour"]);
  });

  it("demotes a window that is about to roll over below one that is not", () => {
    const ordered = orderQuotaWindows(REPORTED_WINDOWS, NOW);

    // Raw percentage would lead with Weekly at 38% left. It resets tomorrow, so
    // the 5-hour window is what the list should lead with.
    expect(ordered.map((entry) => entry.label)).toEqual(["5-hour", "Weekly"]);
  });
});

describe("quotaHeadroomPercent", () => {
  it("scores an allowance against the time it still has to cover", () => {
    // 38% left with roughly a seventh of the week to go is more than a fresh
    // window's worth, so it caps at full rather than reading as nearly spent.
    expect(quotaHeadroomPercent(REPORTED_WINDOWS[1], NOW)).toBe(100);
    expect(quotaHeadroomPercent(REPORTED_WINDOWS[0], NOW)).toBe(100);
  });

  it("still reads as tight when the allowance is short for the time left", () => {
    // 10% left with 80% of the window ahead is genuinely constrained.
    const headroom = quotaHeadroomPercent(
      {
        id: "five_hour",
        label: "5-hour",
        usedPercent: 90,
        windowMinutes: FIVE_HOUR_MINUTES,
        resetsAt: at(hours(4)),
      },
      NOW,
    );

    expect(headroom).toBeCloseTo(12.5, 5);
  });

  it("falls back to the raw remainder when the provider reports no window length", () => {
    expect(
      quotaHeadroomPercent(
        { id: "a", label: "Weekly", usedPercent: 62, resetsAt: at(hours(26)) },
        NOW,
      ),
    ).toBe(38);
    expect(
      quotaHeadroomPercent(
        { id: "a", label: "Weekly", usedPercent: 62, windowMinutes: WEEKLY_MINUTES },
        NOW,
      ),
    ).toBe(38);
  });

  it("treats a window whose reset has passed as refilled", () => {
    expect(
      quotaHeadroomPercent(
        {
          id: "a",
          label: "Weekly",
          usedPercent: 95,
          windowMinutes: WEEKLY_MINUTES,
          resetsAt: at(-hours(1)),
        },
        NOW,
      ),
    ).toBe(100);
  });

  it("keeps a rejected window at zero however much time is left", () => {
    // A stale snapshot must fail toward "still blocked" rather than promise a
    // refill the provider has not confirmed.
    expect(
      quotaHeadroomPercent(
        {
          id: "a",
          label: "5-hour",
          usedPercent: 99,
          exhausted: true,
          windowMinutes: FIVE_HOUR_MINUTES,
          resetsAt: at(-hours(1)),
        },
        NOW,
      ),
    ).toBe(0);
  });
});

describe("leastHeadroomQuotaWindow", () => {
  it("names the window that limits you now, not the lowest number", () => {
    expect(leastHeadroomQuotaWindow(REPORTED_WINDOWS, NOW)?.label).toBe("5-hour");
  });

  it("matches raw ranking when no window reports enough to do better", () => {
    expect(
      leastHeadroomQuotaWindow(
        [
          { id: "a", label: "5-hour", usedPercent: 12 },
          { id: "b", label: "Weekly", usedPercent: 88 },
        ],
        NOW,
      )?.label,
    ).toBe("Weekly");
  });

  it("returns null for an empty window set", () => {
    expect(leastHeadroomQuotaWindow([], NOW)).toBeNull();
  });
});

describe("formatQuotaConstraintHint", () => {
  it("explains the gap when the meter and the lowest number disagree", () => {
    expect(formatQuotaConstraintHint(REPORTED_WINDOWS, NOW)).toBe(
      "Weekly resets in 1d 2h, so your 5-hour window is what limits you right now.",
    );
  });

  it("says nothing when the lowest number is already the real constraint", () => {
    expect(
      formatQuotaConstraintHint(
        [
          { id: "a", label: "5-hour", usedPercent: 12 },
          { id: "b", label: "Weekly", usedPercent: 88 },
        ],
        NOW,
      ),
    ).toBeNull();
  });

  it("has nothing to reconcile with a single window", () => {
    expect(formatQuotaConstraintHint([REPORTED_WINDOWS[0]], NOW)).toBeNull();
    expect(formatQuotaConstraintHint([], NOW)).toBeNull();
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

  it("names the same window the composer meter tracks", () => {
    // Not "Weekly 38% left": the settings row and the meter must agree on which
    // limit is the live one, and the percentage stays the provider's own.
    expect(formatQuotaSummaryLine(quota([...REPORTED_WINDOWS]), NOW)).toBe(
      "5-hour 89% left · resets in 4h 3m",
    );
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

  it("shows nothing left when the provider rejects below a rounded 100%", () => {
    expect(
      quotaRemainingPercent({
        id: "five_hour",
        label: "5-hour",
        usedPercent: 99,
        exhausted: true,
      }),
    ).toBe(0);
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
      isQuotaAlarming(
        quota([]),
        { id: "a", label: "Weekly", usedPercent: 40, exhausted: true },
        NOW,
      ),
    ).toBe(true);
  });

  it("trusts a snapshot-level exhausted status", () => {
    const exhausted: ProviderQuotaSnapshot = { ...quota([]), status: "exhausted" };
    expect(isQuotaAlarming(exhausted, { id: "a", label: "Weekly", usedPercent: 3 }, NOW)).toBe(
      true,
    );
  });

  it("warns on its own once past the threshold", () => {
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 91 }, NOW)).toBe(
      true,
    );
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 90 }, NOW)).toBe(
      false,
    );
  });

  it("stops crying wolf over a nearly spent window that is about to roll over", () => {
    const nearlySpent = {
      id: "seven_day",
      label: "Weekly",
      usedPercent: 95,
      windowMinutes: WEEKLY_MINUTES,
      resetsAt: at(hours(1)),
    };

    // 5% left is alarming across a whole week and unremarkable across an hour.
    expect(isQuotaAlarming(quota([]), nearlySpent, NOW)).toBe(false);
    expect(isQuotaAlarming(quota([]), { ...nearlySpent, resetsAt: at(hours(24 * 6)) }, NOW)).toBe(
      true,
    );
  });

  it("still trusts a rejection over any amount of time left", () => {
    expect(
      isQuotaAlarming(
        quota([]),
        {
          id: "seven_day",
          label: "Weekly",
          usedPercent: 95,
          exhausted: true,
          windowMinutes: WEEKLY_MINUTES,
          resetsAt: at(hours(1)),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("stays calm at comfortable usage", () => {
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 12 }, NOW)).toBe(
      false,
    );
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
