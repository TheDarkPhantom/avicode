import type { ProviderQuotaSnapshot } from "@t3tools/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vite-plus/test";

import { ProviderQuotaMeter } from "./ProviderQuotaMeter";

const NOW = Date.parse("2026-07-29T12:00:00.000Z");

const snapshot = (overrides: Partial<ProviderQuotaSnapshot> = {}): ProviderQuotaSnapshot => ({
  windows: [
    { id: "primary", label: "5-hour", usedPercent: 12, resetsAt: "2026-07-29T15:00:00.000Z" },
    { id: "secondary", label: "Weekly", usedPercent: 62, resetsAt: "2026-08-01T16:00:00.000Z" },
  ],
  capturedAt: "2026-07-29T12:00:00.000Z",
  ...overrides,
});

describe("ProviderQuotaMeter", () => {
  it("labels the trigger with what is left of the lowest-reading window", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot()} instanceLabel="Work Codex" now={NOW} />,
    );

    // The weekly window shows the smallest number, and 62% used is 38% left;
    // the bar must reflect that rather than the roomier 5-hour.
    expect(markup).toContain("Work Codex usage: 38% of Weekly limit remaining");
  });

  it("falls back to a generic heading when the instance has no label", () => {
    const markup = renderToStaticMarkup(<ProviderQuotaMeter quota={snapshot()} now={NOW} />);

    expect(markup).toContain("Plan usage: 38% of Weekly limit remaining");
  });

  it("renders nothing when there are no windows to show", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot({ windows: [] })} now={NOW} />,
    );

    expect(markup).toBe("");
  });

  it("starts full when nothing has been spent", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "primary", label: "Weekly", usedPercent: 0 }] })}
        now={NOW}
      />,
    );

    expect(markup).toContain("height:100%");
    expect(markup).toContain('aria-valuenow="100"');
  });

  it("keeps a nearly-spent reading precise instead of rounding it away", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "primary", label: "Weekly", usedPercent: 99.6 }] })}
        now={NOW}
      />,
    );

    expect(markup).toContain("0.4% of Weekly limit remaining");
  });

  it("shows zero remaining when the provider has rejected the window", () => {
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
        instanceLabel="Claude – Lawrence"
        now={NOW}
      />,
    );

    expect(markup).toContain("Claude – Lawrence usage: 0% of 5-hour limit remaining");
    expect(markup).toContain('aria-valuenow="0"');
    expect(markup).toContain("height:0%");
  });

  // Only the popover *trigger* appears in static markup — the body renders
  // lazily on open. So the bar is what these assert; the popover copy is
  // covered by `isQuotaAlarming` in providerQuota.test.ts.
  it("drains the bar toward red as the allowance is spent", () => {
    const full = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "a", label: "Weekly", usedPercent: 0 }] })}
        now={NOW}
      />,
    );
    const empty = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "a", label: "Weekly", usedPercent: 100 }] })}
        now={NOW}
      />,
    );

    // Hue 140 is green, hue 0 is red — the ramp's two endpoints.
    expect(full).toContain("hsl(140.0");
    expect(empty).toContain("hsl(0.0");
    expect(full).toContain("height:100%");
    expect(empty).toContain("height:0%");
  });

  it("tracks the lowest raw window even when it is about to roll over", () => {
    // The bar previously projected headroom here and read full while Weekly
    // sat at 38% — a bar contradicting every number in its own popover. It now
    // shows the raw number; the popover's footer hint carries the reset story.
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            {
              id: "five_hour",
              label: "5-hour",
              usedPercent: 11,
              windowMinutes: 300,
              resetsAt: "2026-07-29T16:03:00.000Z",
            },
            {
              id: "seven_day",
              label: "Weekly",
              usedPercent: 62,
              windowMinutes: 10_080,
              resetsAt: "2026-07-30T14:00:00.000Z",
            },
          ],
        })}
        instanceLabel="Claude – Lawrence"
        now={NOW}
      />,
    );

    expect(markup).toContain("height:38%");
    expect(markup).toContain("Claude – Lawrence usage: 38% of Weekly limit remaining");
  });

  it("still drains when the window has most of its span left to cover", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            {
              id: "five_hour",
              label: "5-hour",
              usedPercent: 90,
              windowMinutes: 300,
              resetsAt: "2026-07-29T16:00:00.000Z",
            },
          ],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain("height:10%");
    expect(markup).toContain("10% of 5-hour limit remaining");
  });

  it("never lets an untouched unknown window drive the bar", () => {
    // The reported bug: Claude's /usage grew `extra_usage` and `nimbus_quill`,
    // both untouched at 100% left, and the meter read full while Weekly sat
    // at 8%.
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          windows: [
            { id: "extra_usage", label: "Extra usage", usedPercent: 0 },
            { id: "nimbus_quill", label: "Nimbus quill", usedPercent: 0 },
            {
              id: "seven_day",
              label: "Weekly",
              usedPercent: 92,
              windowMinutes: 10_080,
              resetsAt: "2026-07-29T21:17:00.000Z",
            },
          ],
        })}
        instanceLabel="Claude – Lawrence"
        now={NOW}
      />,
    );

    expect(markup).toContain("height:8%");
    expect(markup).toContain("Claude – Lawrence usage: 8% of Weekly limit remaining");
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
