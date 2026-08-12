import type { ProviderQuotaSnapshot } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { formatPercentage } from "~/lib/contextWindow";
import {
  filterNonOverageWindows,
  formatComposerQuotaPair,
  formatQuotaConstraintHint,
  formatResetsIn,
  isQuotaAlarming,
  leastHeadroomQuotaWindow,
  lowestRemainingQuotaWindow,
  orderQuotaWindows,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
  selectComposerQuotaWindows,
} from "~/lib/providerQuota";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * How often the meter re-reads the clock.
 *
 * The warning state is a function of time now, not just of the last snapshot, so a window
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
 * Sits beside `ContextWindowMeter` as a quiet `5h/weekly` pair. Conservative
 * steps reduce visual churn while the popover retains exact readings and reset
 * times. Time-adjusted headroom controls only the warning colour.
 *
 * Overage-class and unknown windows (Claude's `extra_usage`, whatever it adds
 * next) stay listed in the popover but never drive the summary, alarm, or
 * hint — an allowance you have not touched cannot be the thing limiting you.
 */
export function ProviderQuotaMeter(props: {
  quota: ProviderQuotaSnapshot;
  instanceLabel?: string | null;
  /** Injected so the reset countdown is deterministic in tests. */
  now?: number;
}) {
  const { quota, instanceLabel } = props;
  const now = useQuotaClock(props.now);
  const realWindows = filterNonOverageWindows(quota.windows);
  const worst = lowestRemainingQuotaWindow(realWindows, now);
  const composerWindows = selectComposerQuotaWindows(realWindows);
  if (!worst || (!composerWindows.fiveHour && !composerWindows.weekly)) {
    return null;
  }

  // The popover lists every window the provider reports, overage included, so
  // an unfamiliar bucket is at least visible — it just sinks to the bottom.
  const windows = orderQuotaWindows(quota.windows, now);
  const isExhausted = quota.status === "exhausted" || worst.exhausted === true;
  const summaryWindows = [composerWindows.fiveHour, composerWindows.weekly].filter(
    (window): window is NonNullable<typeof window> => window !== null,
  );
  const limitingWindow = leastHeadroomQuotaWindow(summaryWindows, now);
  const isAlarming = limitingWindow ? isQuotaAlarming(quota, limitingWindow, now) : false;
  const constraintHint = formatQuotaConstraintHint(realWindows, now);
  const heading = instanceLabel ? `${instanceLabel} usage` : "Plan usage";
  const pair = formatComposerQuotaPair(composerWindows).split("/");
  const quotaNumberStyle = (window: typeof composerWindows.fiveHour) =>
    window ? { color: quotaRemainingColor(quotaRemainingPercent(window)) } : undefined;
  const describeWindow = (label: string, window: typeof composerWindows.fiveHour) => {
    if (!window) return `${label} limit unavailable`;
    const remaining = formatPercentage(quotaRemainingPercent(window)) ?? "0%";
    const reset = formatResetsIn(window.resetsAt, now);
    return `${remaining} of ${label} limit remaining${reset ? `, ${reset}` : ""}`;
  };
  const accessibleLabel = `${heading}: ${describeWindow("5-hour", composerWindows.fiveHour)}; ${describeWindow("weekly", composerWindows.weekly)}`;

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
              "inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md border border-transparent px-1 font-medium text-[11px] text-muted-foreground tabular-nums outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={accessibleLabel}
          >
            <span style={quotaNumberStyle(composerWindows.fiveHour)}>{pair[0]}</span>
            <span className="text-muted-foreground/50">/</span>
            <span style={quotaNumberStyle(composerWindows.weekly)}>{pair[1]}</span>
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
            <div>
              <div className="font-medium text-muted-foreground text-xs">{heading}</div>
              <div className="text-[10px] text-muted-foreground/50">5h / weekly</div>
            </div>
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
            // Shown only when the window the bar shows is not the one that
            // actually limits you — usually because the low-reading window is
            // about to roll over.
            <div className="mt-1 text-pretty text-[11px] text-muted-foreground/70">
              {constraintHint}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
