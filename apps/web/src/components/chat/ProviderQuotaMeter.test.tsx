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
  it("labels the trigger with the most-constrained window", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot()} instanceLabel="Work Codex" now={NOW} />,
    );

    // The weekly window is the one that will actually stop you; the ring must
    // reflect it rather than the roomier 5-hour reading.
    expect(markup).toContain("Work Codex usage: 62% of Weekly limit used");
  });

  it("falls back to a generic heading when the instance has no label", () => {
    const markup = renderToStaticMarkup(<ProviderQuotaMeter quota={snapshot()} now={NOW} />);

    expect(markup).toContain("Plan usage: 62% of Weekly limit used");
  });

  it("renders nothing when there are no windows to show", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter quota={snapshot({ windows: [] })} now={NOW} />,
    );

    expect(markup).toBe("");
  });

  it("keeps a sub-10% reading precise instead of rounding it to zero", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({ windows: [{ id: "primary", label: "Weekly", usedPercent: 0.4 }] })}
        now={NOW}
      />,
    );

    expect(markup).toContain("0.4% of Weekly limit used");
  });

  // Only the popover *trigger* appears in static markup — the body renders
  // lazily on open. So the ring is what these assert; the warning text inside
  // the popover is covered by `isQuotaAlarming` in providerQuota.test.ts.
  it("turns the ring red when a limit is exhausted", () => {
    const markup = renderToStaticMarkup(
      <ProviderQuotaMeter
        quota={snapshot({
          status: "exhausted",
          windows: [{ id: "secondary", label: "Weekly", usedPercent: 100, exhausted: true }],
        })}
        now={NOW}
      />,
    );

    expect(markup).toContain("var(--color-red-500)");
  });

  it("leaves the ring neutral while usage is comfortable", () => {
    const markup = renderToStaticMarkup(<ProviderQuotaMeter quota={snapshot()} now={NOW} />);

    expect(markup).not.toContain("var(--color-red-500)");
  });
});
