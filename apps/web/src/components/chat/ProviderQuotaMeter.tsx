import type { ProviderQuotaSnapshot } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { formatPercentage } from "~/lib/contextWindow";
import {
  formatQuotaConstraintHint,
  formatResetsIn,
  isQuotaAlarming,
  leastHeadroomQuotaWindow,
  orderQuotaWindows,
  quotaHeadroomPercent,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
} from "~/lib/providerQuota";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * How often the meter re-reads the clock.
 *
 * The bar is a function of time now, not just of the last snapshot, so a window
 * left open for hours would otherwise keep rendering yesterday's headroom. A
 * minute is finer than any reset countdown this shows and costs one state
 * update — the standing ban on continuous repainting is aimed at GPU-bound
 * animation, not at a clock.
 */
const QUOTA_CLOCK_TICK_MS = 60_000;

function useQuotaClock(fixedNow: number | undefined): number {
  const [now, setNow] = useState(() => fixedNow ?? Date.now());

  useEffect(() => {
    // An injected clock is a test asking for a frozen one.
    if (fixedNow !== undefined) {
      return;
    }
    const timer = setInterval(() => {
      setNow(Date.now());
    }, QUOTA_CLOCK_TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [fixedNow]);

  return fixedNow ?? now;
}

/**
 * Always-visible plan-allowance meter for the thread's provider instance.
 *
 * Sits beside `ContextWindowMeter` and deliberately does *not* mirror its ring:
 * the two answer different questions and should not be mistaken for each other
 * at a glance. Context occupancy fills up within a conversation; a plan
 * allowance drains away across the week. So this is a vertical bar that starts
 * full and green and empties downward toward red — the shape carries the
 * meaning before any number is read.
 *
 * It tracks the window with the least *headroom*. Codex and Claude both enforce
 * several at once (rolling hours plus a weekly cap), and the one that will
 * actually stop you is whichever has least allowance for the time it still has
 * to cover — not whichever shows the smallest number. Averaging them would hide
 * exactly the number that matters, and ranking them on raw percentage alone
 * hands the meter to a weekly cap that is about to roll over.
 *
 * So the bar's height is headroom, while every number in the popover stays the
 * provider's raw reading. When those two tell different stories, the footer
 * says why in a sentence.
 */
export function ProviderQuotaMeter(props: {
  quota: ProviderQuotaSnapshot;
  instanceLabel?: string | null;
  /** Injected so the reset countdown is deterministic in tests. */
  now?: number;
}) {
  const { quota, instanceLabel } = props;
  const now = useQuotaClock(props.now);
  const worst = leastHeadroomQuotaWindow(quota.windows, now);
  if (!worst) {
    return null;
  }

  const windows = orderQuotaWindows(quota.windows, now);
  // Headroom drives the bar; the raw remainder is what gets announced, because
  // a screen reader must hear the provider's number rather than our projection.
  const headroom = quotaHeadroomPercent(worst, now);
  const remainingLabel = formatPercentage(quotaRemainingPercent(worst)) ?? "0%";
  const isExhausted = quota.status === "exhausted" || worst.exhausted === true;
  const isAlarming = isQuotaAlarming(quota, worst, now);
  const constraintHint = formatQuotaConstraintHint(quota.windows, now);
  const heading = instanceLabel ? `${instanceLabel} usage` : "Plan usage";

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex size-7 cursor-pointer items-center justify-center rounded-full border border-transparent text-muted-foreground outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={`${heading}: ${remainingLabel} of ${worst.label} limit remaining`}
          >
            <span
              className="relative flex h-5 w-1.5 items-end overflow-hidden rounded-full bg-muted/60"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(headroom)}
            >
              <span
                className={cn(
                  "w-full rounded-full transition-[height] duration-500 ease-out motion-reduce:transition-none",
                  // A hairline of colour at zero, so an exhausted limit still
                  // reads as "empty and red" rather than as a broken meter.
                  "min-h-[2px]",
                  isExhausted && "animate-pulse motion-reduce:animate-none",
                )}
                style={{
                  height: `${headroom}%`,
                  backgroundImage: quotaRemainingGradient(headroom),
                }}
              />
            </span>
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        className="dropdown-glass w-64 max-w-none border-0! bg-secondary! p-0 shadow-none! before:hidden"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">{heading}</div>
            {quota.planType ? (
              <div className="text-[11px] text-muted-foreground/70 capitalize">
                {quota.planType}
              </div>
            ) : null}
          </div>

          {windows.map((window) => {
            const windowRemaining = quotaRemainingPercent(window);
            const label = formatPercentage(windowRemaining) ?? "0%";
            const resetsIn = formatResetsIn(window.resetsAt, now);

            return (
              <div key={window.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
                  <span className="text-muted-foreground/60">{window.label}</span>
                  <span
                    className="font-medium tabular-nums"
                    style={{ color: quotaRemainingColor(windowRemaining) }}
                  >
                    {label} left
                  </span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
                  role="meter"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(windowRemaining)}
                  aria-label={`${window.label} limit remaining`}
                >
                  <div
                    className="h-full rounded-full transition-[width] duration-500 ease-out motion-reduce:transition-none"
                    style={{
                      width: `${windowRemaining}%`,
                      backgroundImage: quotaRemainingGradient(windowRemaining),
                    }}
                  />
                </div>
                {resetsIn ? (
                  <div className="text-[11px] leading-4 text-muted-foreground/50">{resetsIn}</div>
                ) : null}
              </div>
            );
          })}

          {isExhausted ? (
            <div className="mt-1 text-pretty text-[11px] font-medium text-red-500">
              This limit has been reached. Requests will fail until it resets.
            </div>
          ) : isAlarming ? (
            <div className="mt-1 text-pretty text-[11px] font-medium text-muted-foreground/70">
              Running low — this limit is nearly spent.
            </div>
          ) : constraintHint ? (
            // Shown only when the bar is tracking a different window from the
            // lowest number above it, which is the one reading that otherwise
            // looks like a contradiction.
            <div className="mt-1 text-pretty text-[11px] text-muted-foreground/70">
              {constraintHint}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
