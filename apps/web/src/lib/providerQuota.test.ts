import type { ProviderQuotaSnapshot, ServerProvider } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  filterNonOverageWindows,
  formatComposerQuotaPair,
  formatQuotaConstraintHint,
  formatQuotaCost,
  formatQuotaSummaryLine,
  formatResetsIn,
  isQuotaAlarming,
  leastHeadroomQuotaWindow,
  lowestRemainingQuotaWindow,
  orderQuotaWindows,
  quotaHeadroomPercent,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
  selectComposerQuotaWindows,
  selectProviderInstanceLabel,
  selectProviderQuota,
  shouldRefreshProviderQuota,
  steppedQuotaRemainingPercent,
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

  it("orders by the raw number even when a window is about to roll over", () => {
    const ordered = orderQuotaWindows(REPORTED_WINDOWS, NOW);

    // The list must agree with the bar, which shows the lowest raw remaining.
    // Weekly at 38% left leads even though it resets tomorrow; the footer hint
    // carries the reconciliation.
    expect(ordered.map((entry) => entry.label)).toEqual(["Weekly", "5-hour"]);
  });

  it("sinks untouched unknown windows to the bottom", () => {
    const ordered = orderQuotaWindows(
      [
        { id: "extra_usage", label: "Extra usage", usedPercent: 0 },
        { id: "nimbus_quill", label: "Nimbus quill", usedPercent: 0 },
        ...REPORTED_WINDOWS,
      ],
      NOW,
    );

    expect(ordered.map((entry) => entry.label)).toEqual([
      "Weekly",
      "5-hour",
      "Extra usage",
      "Nimbus quill",
    ]);
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

  it("never ranks a full window with no time information as limiting", () => {
    // The bug report: Claude's /usage grew unknown ids (`nimbus_quill`) with no
    // known duration. Untouched, they must not beat a window that is actually
    // being consumed.
    expect(
      leastHeadroomQuotaWindow(
        [{ id: "nimbus_quill", label: "Nimbus quill", usedPercent: 0 }, ...REPORTED_WINDOWS],
        NOW,
      )?.label,
    ).toBe("5-hour");
  });

  it("returns null for an empty window set", () => {
    expect(leastHeadroomQuotaWindow([], NOW)).toBeNull();
  });
});

describe("lowestRemainingQuotaWindow", () => {
  it("picks the window showing the smallest raw number", () => {
    expect(lowestRemainingQuotaWindow(REPORTED_WINDOWS, NOW)?.label).toBe("Weekly");
  });

  it("treats a provider rejection as 0% left regardless of the reported usage", () => {
    expect(
      lowestRemainingQuotaWindow(
        [
          { id: "a", label: "5-hour", usedPercent: 40, exhausted: true },
          { id: "b", label: "Weekly", usedPercent: 88 },
        ],
        NOW,
      )?.label,
    ).toBe("5-hour");
  });

  it("returns null for an empty window set", () => {
    expect(lowestRemainingQuotaWindow([], NOW)).toBeNull();
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

  it("never names an untouched unknown window as the constraint", () => {
    // The bug report verbatim: an unknown full window used to win the "limits
    // you right now" slot against every real window.
    expect(
      formatQuotaConstraintHint(
        [
          { id: "nimbus_quill", label: "Nimbus quill", usedPercent: 0 },
          {
            id: "seven_day",
            label: "Weekly",
            usedPercent: 92,
            windowMinutes: WEEKLY_MINUTES,
            resetsAt: at(hours(9) + 17 * 60_000),
          },
          REPORTED_WINDOWS[0],
        ],
        NOW,
      ),
    ).toBe("Weekly resets in 9h 17m, so your 5-hour window is what limits you right now.");
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

  it("names the same window the composer bar tracks", () => {
    // The settings row and the bar must agree, and the bar shows the lowest
    // raw remaining even when that window resets soon.
    expect(formatQuotaSummaryLine(quota([...REPORTED_WINDOWS]), NOW)).toBe(
      "Weekly 38% left · resets in 1d 2h",
    );
  });

  it("ignores overage-class windows", () => {
    expect(
      formatQuotaSummaryLine(
        quota([{ id: "extra_usage", label: "Extra usage", usedPercent: 0 }, REPORTED_WINDOWS[1]]),
        NOW,
      ),
    ).toBe("Weekly 38% left · resets in 1d 2h");
  });

  it("returns null when only overage-class windows exist", () => {
    expect(
      formatQuotaSummaryLine(
        quota([
          { id: "overage", label: "Overage", usedPercent: 10 },
          { id: "extra_usage", label: "Extra usage", usedPercent: 0 },
        ]),
        NOW,
      ),
    ).toBeNull();
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

describe("stepped composer quota", () => {
  it.each([
    [0, 0],
    [1, 1],
    [8.9, 8],
    [20, 20],
    [20.9, 20],
    [21, 20],
    [29, 20],
    [30, 30],
    [39, 30],
    [40, 40],
    [49, 40],
    [50, 50],
    [74, 50],
    [75, 75],
    [99, 75],
    [100, 100],
    [-1, 0],
    [101, 100],
    [Number.NaN, 0],
  ])("steps %s%% remaining down to %s", (remaining, expected) => {
    expect(steppedQuotaRemainingPercent(remaining)).toBe(expected);
  });

  it("selects Codex primary then secondary", () => {
    const selected = selectComposerQuotaWindows([
      { id: "secondary", label: "Weekly", usedPercent: 60 },
      { id: "primary", label: "5-hour", usedPercent: 10 },
    ]);

    expect(selected.fiveHour?.id).toBe("primary");
    expect(selected.weekly?.id).toBe("secondary");
    expect(formatComposerQuotaPair(selected)).toBe("75/40");
  });

  it("does not reuse Codex's single weekly primary window as 5-hour", () => {
    const selected = selectComposerQuotaWindows([
      { id: "primary", label: "Weekly", usedPercent: 20, windowMinutes: 10_080 },
    ]);

    expect(selected.fiveHour).toBeNull();
    expect(selected.weekly?.id).toBe("primary");
    expect(formatComposerQuotaPair(selected)).toBe("–/75");
  });

  it("uses durations and prefers Claude's general weekly window", () => {
    const selected = selectComposerQuotaWindows([
      { id: "seven_day_opus", label: "Weekly (Opus)", usedPercent: 80, windowMinutes: 10_080 },
      { id: "five_hour", label: "5-hour", usedPercent: 62, windowMinutes: 300 },
      { id: "seven_day", label: "Weekly", usedPercent: 51, windowMinutes: 10_080 },
    ]);

    expect(selected.fiveHour?.id).toBe("five_hour");
    expect(selected.weekly?.id).toBe("seven_day");
    expect(formatComposerQuotaPair(selected)).toBe("30/40");
  });

  it("falls back to a model-specific weekly window and ignores overage", () => {
    const selected = selectComposerQuotaWindows([
      { id: "extra_usage", label: "Extra usage", usedPercent: 0, windowMinutes: 10_080 },
      { id: "seven_day_sonnet", label: "Weekly (Sonnet)", usedPercent: 82 },
    ]);

    expect(selected.fiveHour).toBeNull();
    expect(selected.weekly?.id).toBe("seven_day_sonnet");
    expect(formatComposerQuotaPair(selected)).toBe("–/18");
  });

  it("forces exhausted windows to zero", () => {
    expect(
      formatComposerQuotaPair({
        fiveHour: { id: "five_hour", label: "5-hour", usedPercent: 72, exhausted: true },
        weekly: null,
      }),
    ).toBe("0/–");
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

  it("stays calm when a nearly spent window is about to roll over", () => {
    expect(
      isQuotaAlarming(
        quota([]),
        {
          id: "seven_day",
          label: "Weekly",
          usedPercent: 95,
          windowMinutes: WEEKLY_MINUTES,
          resetsAt: at(hours(1)),
        },
        NOW,
      ),
    ).toBe(false);
  });

  it("warns when a nearly spent window still has substantial time left", () => {
    expect(
      isQuotaAlarming(
        quota([]),
        {
          id: "seven_day",
          label: "Weekly",
          usedPercent: 95,
          windowMinutes: WEEKLY_MINUTES,
          resetsAt: at(hours(6 * 24)),
        },
        NOW,
      ),
    ).toBe(true);
  });

  it("stays calm at comfortable usage", () => {
    expect(isQuotaAlarming(quota([]), { id: "a", label: "Weekly", usedPercent: 12 })).toBe(false);
  });
});

describe("filterNonOverageWindows", () => {
  it("drops overage-class windows and keeps everything else", () => {
    const filtered = filterNonOverageWindows([
      { id: "overage", label: "Overage", usedPercent: 10 },
      { id: "extra_usage", label: "Extra usage", usedPercent: 0 },
      { id: "nimbus_quill", label: "Nimbus quill", usedPercent: 0 },
      ...REPORTED_WINDOWS,
    ]);

    expect(filtered.map((entry) => entry.id)).toEqual(["nimbus_quill", "five_hour", "seven_day"]);
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
