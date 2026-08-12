import type { ProviderQuotaSnapshot } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderQuotaMeter } from "./ProviderQuotaMeter";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

const snapshot = (overrides: Partial<ProviderQuotaSnapshot> = {}): ProviderQuotaSnapshot => ({
  windows: [
    {
      id: "primary",
      label: "5-hour",
      usedPercent: 12,
      windowMinutes: 300,
      resetsAt: "2026-07-29T15:00:00.000Z",
    },
    {
      id: "secondary",
      label: "Weekly",
      usedPercent: 62,
      windowMinutes: 10_080,
      resetsAt: "2026-08-01T16:00:00.000Z",
    },
  ],
  capturedAt: "2026-07-29T12:00:00.000Z",
  ...overrides,
});

describe("ProviderQuotaMeter", () => {
  it("renders the stepped 5-hour and weekly pair without an aggregate bar", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot()} instanceLabel="Work Codex" now={NOW} />,
    );

    expect(markup).toContain(">75/30</button>");
    expect(markup).not.toContain("height:38%");
    expect(markup).not.toContain('role="meter"');
  });

  it("puts exact values and both reset countdowns in the accessible label", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot()} instanceLabel="Work Codex" now={NOW} />,
    );

    expect(markup).toContain(
      "Work Codex usage: 88% of 5-hour limit remaining, resets in 3h; 38% of weekly limit remaining, resets in 3d 4h",
    );
  });

  it("shows a dash for a missing window and describes it accessibly", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [{ id: "five_hour", label: "5-hour", usedPercent: 25 }],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain(">75/–</button>");
    expect(markup).toContain("weekly limit unavailable");
  });

  it("shows exhausted windows as zero without a pulse animation", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          status: "exhausted",
          windows: [
            {
              id: "five_hour",
              label: "5-hour",
              usedPercent: 99,
              exhausted: true,
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain(">0/–</button>");
    expect(markup).toContain("text-red-500");
    expect(markup).not.toContain("animate-pulse");
  });

  it("stays calm when low raw allowance resets soon", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            {
              id: "seven_day",
              label: "Weekly",
              usedPercent: 95,
              windowMinutes: 10_080,
              resetsAt: "2026-07-29T13:00:00.000Z",
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain(">–/5</button>");
    expect(markup).not.toContain("text-red-500");
  });

  it("warns when low allowance has substantial time left", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            {
              id: "seven_day",
              label: "Weekly",
              usedPercent: 95,
              windowMinutes: 10_080,
              resetsAt: "2026-08-04T12:00:00.000Z",
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain("text-red-500");
  });

  it("renders nothing without a canonical 5-hour or weekly window", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "nimbus_quill", label: "Nimbus", usedPercent: 4 }] })}
        now={NOW}
      />,
    );

    expect(markup).toBe("");
  });

  it("renders nothing when only overage-class windows exist", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            { id: "overage", label: "Overage", usedPercent: 10 },
            { id: "extra_usage", label: "Extra usage", usedPercent: 0 },
          ],
        })}
        now={NOW}
      />,
    );

    expect(markup).toBe("");
  });
});
