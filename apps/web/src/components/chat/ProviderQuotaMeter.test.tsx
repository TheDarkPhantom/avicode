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
  it("labels the trigger with what is left of the most-constrained window", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot()} instanceLabel="Work Codex" now={NOW} />,
    );

    // The weekly window is the one that will actually stop you, and 62% used
    // is 38% left; the bar must reflect that rather than the roomier 5-hour.
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
});
