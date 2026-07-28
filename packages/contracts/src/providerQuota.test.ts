import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  clampQuotaUsedPercent,
  mergeProviderQuotaSnapshots,
  mergeProviderQuotaWindows,
  mostConstrainedQuotaWindow,
  ProviderQuotaSnapshot,
  ProviderQuotaWindow,
  ProviderTurnUsage,
} from "./providerQuota.ts";

const decodeSnapshot = Schema.decodeUnknownSync(ProviderQuotaSnapshot);
const decodeTurnUsage = Schema.decodeUnknownSync(ProviderTurnUsage);

const window = (
  id: string,
  usedPercent: number,
  extra: Partial<ProviderQuotaWindow> = {},
): ProviderQuotaWindow => ({ id, label: id, usedPercent, ...extra });

describe("ProviderQuotaSnapshot", () => {
  it("round-trips a full snapshot", () => {
    const snapshot = {
      windows: [
        {
          id: "five_hour",
          label: "5-hour",
          usedPercent: 42,
          resetsAt: "2026-07-29T18:00:00.000Z",
          windowMinutes: 300,
          exhausted: false,
        },
      ],
      planType: "max",
      status: "ok",
      capturedAt: "2026-07-29T15:00:00.000Z",
    };

    expect(decodeSnapshot(snapshot)).toEqual(snapshot);
  });

  it("accepts a minimal snapshot with no windows", () => {
    expect(decodeSnapshot({ windows: [], capturedAt: "2026-07-29T15:00:00.000Z" })).toEqual({
      windows: [],
      capturedAt: "2026-07-29T15:00:00.000Z",
    });
  });

  it("rejects an out-of-range percentage so adapters must clamp first", () => {
    expect(() =>
      decodeSnapshot({
        windows: [{ id: "weekly", label: "Weekly", usedPercent: 105 }],
        capturedAt: "2026-07-29T15:00:00.000Z",
      }),
    ).toThrow();
  });
});

describe("clampQuotaUsedPercent", () => {
  it.each([
    [105, 100],
    [-3, 0],
    [42.5, 42.5],
    [0, 0],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampQuotaUsedPercent(input)).toBe(expected);
  });

  it.each([undefined, null, Number.NaN, Number.POSITIVE_INFINITY, "50"])(
    "returns null for %s so the window can be dropped",
    (input) => {
      expect(clampQuotaUsedPercent(input)).toBeNull();
    },
  );
});

describe("mergeProviderQuotaWindows", () => {
  it("patches by id rather than replacing, so a single-window push does not erase the others", () => {
    const previous = [window("five_hour", 10), window("seven_day", 60)];

    expect(mergeProviderQuotaWindows(previous, [window("five_hour", 25)])).toEqual([
      window("five_hour", 25),
      window("seven_day", 60),
    ]);
  });

  it("appends genuinely new ids while keeping existing order stable", () => {
    const previous = [window("five_hour", 10), window("seven_day", 60)];

    expect(mergeProviderQuotaWindows(previous, [window("overage", 5)])).toEqual([
      window("five_hour", 10),
      window("seven_day", 60),
      window("overage", 5),
    ]);
  });

  it("returns the incoming set verbatim when nothing is known yet", () => {
    expect(mergeProviderQuotaWindows([], [window("weekly", 3)])).toEqual([window("weekly", 3)]);
  });
});

describe("mergeProviderQuotaSnapshots", () => {
  const previous: ProviderQuotaSnapshot = {
    windows: [window("five_hour", 10), window("seven_day", 60)],
    planType: "max",
    status: "ok",
    capturedAt: "2026-07-29T15:00:00.000Z",
  };

  it("keeps planType and status when the incoming snapshot omits them", () => {
    const merged = mergeProviderQuotaSnapshots(previous, {
      windows: [window("five_hour", 25)],
      capturedAt: "2026-07-29T15:05:00.000Z",
    });

    expect(merged).toEqual({
      windows: [window("five_hour", 25), window("seven_day", 60)],
      planType: "max",
      status: "ok",
      capturedAt: "2026-07-29T15:05:00.000Z",
    });
  });

  it("lets the incoming snapshot overwrite planType and status when it has them", () => {
    const merged = mergeProviderQuotaSnapshots(previous, {
      windows: [],
      planType: "pro",
      status: "exhausted",
      capturedAt: "2026-07-29T15:05:00.000Z",
    });

    expect(merged.planType).toBe("pro");
    expect(merged.status).toBe("exhausted");
  });

  it("passes the incoming snapshot straight through when there is no previous one", () => {
    const incoming: ProviderQuotaSnapshot = {
      windows: [window("weekly", 1)],
      capturedAt: "2026-07-29T15:00:00.000Z",
    };

    expect(mergeProviderQuotaSnapshots(undefined, incoming)).toBe(incoming);
  });
});

describe("mostConstrainedQuotaWindow", () => {
  it("picks the highest percentage", () => {
    expect(mostConstrainedQuotaWindow([window("five_hour", 10), window("seven_day", 88)])).toEqual(
      window("seven_day", 88),
    );
  });

  it("returns null for an empty set so the meter can hide", () => {
    expect(mostConstrainedQuotaWindow([])).toBeNull();
  });
});

describe("ProviderTurnUsage", () => {
  it("round-trips an additive turn record", () => {
    const usage = {
      model: "claude-opus-5",
      inputTokens: 1200,
      cachedInputTokens: 800,
      cacheCreationInputTokens: 100,
      outputTokens: 340,
      reasoningOutputTokens: 90,
      costUsd: 0.0421,
      durationMs: 8100,
    };

    expect(decodeTurnUsage(usage)).toEqual(usage);
  });

  it("allows cost to be absent for providers that do not report spend", () => {
    expect(decodeTurnUsage({ inputTokens: 10, outputTokens: 5 })).toEqual({
      inputTokens: 10,
      outputTokens: 5,
    });
  });
});
