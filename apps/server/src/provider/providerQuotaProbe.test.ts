import { describe, expect, it } from "vite-plus/test";

import { normalizeClaudeProbeQuota, normalizeCodexProbeQuota } from "./providerQuotaProbe.ts";

const CAPTURED_AT = "2026-07-29T12:00:00.000Z";

describe("provider quota probes", () => {
  it("normalizes Codex plan windows read during a provider status probe", () => {
    expect(
      normalizeCodexProbeQuota(
        {
          rateLimits: {
            primary: {
              usedPercent: 92,
              windowDurationMins: 300,
              resetsAt: 1_775_000_000,
            },
            secondary: {
              usedPercent: 41,
              windowDurationMins: 10_080,
              resetsAt: 1_776_000_000,
            },
            planType: "pro",
          },
        },
        CAPTURED_AT,
      ),
    ).toEqual({
      windows: [
        {
          id: "primary",
          label: "5-hour",
          usedPercent: 92,
          windowMinutes: 300,
          resetsAt: "2026-03-31T23:33:20.000Z",
        },
        {
          id: "secondary",
          label: "Weekly",
          usedPercent: 41,
          windowMinutes: 10_080,
          resetsAt: "2026-04-12T13:20:00.000Z",
        },
      ],
      planType: "pro",
      status: "ok",
      capturedAt: CAPTURED_AT,
    });
  });

  it("normalizes Claude usage without inventing limits for API-key sessions", () => {
    expect(
      normalizeClaudeProbeQuota(
        {
          rate_limits_available: true,
          subscription_type: "max",
          rate_limits: {
            five_hour: { utilization: 78, resets_at: "2026-07-29T15:00:00.000Z" },
            seven_day: { utilization: 34, resets_at: "2026-08-03T00:00:00.000Z" },
          },
        },
        CAPTURED_AT,
      ),
    ).toEqual({
      windows: [
        {
          id: "five_hour",
          label: "5-hour",
          usedPercent: 78,
          resetsAt: "2026-07-29T15:00:00.000Z",
        },
        {
          id: "seven_day",
          label: "Weekly",
          usedPercent: 34,
          resetsAt: "2026-08-03T00:00:00.000Z",
        },
      ],
      planType: "max",
      capturedAt: CAPTURED_AT,
    });
    expect(
      normalizeClaudeProbeQuota({ rate_limits_available: false, rate_limits: null }, CAPTURED_AT),
    ).toBeUndefined();
  });
});
