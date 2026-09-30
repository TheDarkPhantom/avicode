import { EventId, TurnId } from "@t3tools/contracts";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vite-plus/test";

import { deriveLatestContextWindowSnapshot } from "~/lib/contextWindow";
import { ContextWindowMeter } from "./ContextWindowMeter";

vi.mock("../ui/popover", () => ({
  Popover: ({ children }: { children: ReactNode }) => children,
  PopoverPopup: ({ children }: { children: ReactNode }) => children,
  PopoverTrigger: ({ closeDelay, render }: { closeDelay: number; render: ReactNode }) => (
    <div data-close-delay={closeDelay}>{render}</div>
  ),
}));

function snapshot(payload: Record<string, unknown>) {
  const usage = deriveLatestContextWindowSnapshot([
    {
      id: EventId.make("activity-1"),
      tone: "info",
      kind: "context-window.updated",
      summary: "Context updated",
      payload,
      turnId: TurnId.make("turn-1"),
      createdAt: "2026-08-24T12:00:00.000Z",
    },
  ]);
  if (!usage) {
    throw new Error("The context window test fixture did not produce a snapshot.");
  }
  return usage;
}

const usage = snapshot({ usedTokens: 100_000, maxTokens: 1_000_000 });

describe("ContextWindowMeter", () => {
  it("keeps the hover popover open while the pointer moves to the compact button", () => {
    const markup = renderToStaticMarkup(<ContextWindowMeter usage={usage} onCompact={() => {}} />);

    expect(markup).toContain('data-close-delay="150"');
    expect(markup).toContain("Compact context");
  });

  it("closes an informational hover popover without delay", () => {
    const markup = renderToStaticMarkup(<ContextWindowMeter usage={usage} />);

    expect(markup).toContain('data-close-delay="0"');
    expect(markup).not.toContain("Compact context");
  });

  it("explains why the compact action is disabled", () => {
    const markup = renderToStaticMarkup(
      <ContextWindowMeter
        usage={usage}
        onCompact={() => {}}
        compactDisabled
        compactDisabledReason="Compacting is unavailable right now"
      />,
    );

    expect(markup).toContain('disabled=""');
    expect(markup).toContain(">Compacting is unavailable right now<");
  });

  it("marks the auto-compact threshold on the usage bar", () => {
    const markup = renderToStaticMarkup(
      <ContextWindowMeter
        usage={snapshot({
          usedTokens: 100_000,
          maxTokens: 1_000_000,
          compactsAutomatically: true,
          autoCompactThreshold: 800_000,
        })}
      />,
    );

    expect(markup).toContain('data-testid="auto-compact-marker"');
    expect(markup).toContain("left:80%");
    expect(markup).toContain("Compacts automatically at 800,000 tokens.");
  });

  it("omits the marker when no threshold is reported", () => {
    const markup = renderToStaticMarkup(<ContextWindowMeter usage={usage} />);

    expect(markup).not.toContain("auto-compact-marker");
  });
});
