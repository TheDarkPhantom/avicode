import type { ServerProvider } from "@t3tools/contracts";
import { useEffect, useState } from "react";

import { cn } from "~/lib/utils";
import { formatPercentage } from "~/lib/contextWindow";
import {
  filterNonOverageWindows,
  formatResetsIn,
  isQuotaAlarming,
  leastHeadroomQuotaWindow,
  orderQuotaWindows,
  quotaRemainingColor,
  quotaRemainingGradient,
  quotaRemainingPercent,
} from "~/lib/providerQuota";

const QUOTA_CLOCK_TICK_MS = 60_000;

function useQuotaClock(fixedNow: number | undefined): number {
  const [now, setNow] = useState(() => fixedNow ?? Date.now());

  useEffect(() => {
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
 * Quota gauge card for one provider instance.
 *
 * Filters out overage windows and renders horizontal bars per remaining window,
 * reusing the same visual language as `ProviderQuotaMeter`'s popover.
 */
export function UsageQuotaSummary(props: {
  provider: ServerProvider;
  /** Compact mode for the hover popover (less padding, smaller text). */
  compact?: boolean;
  /** Injected clock for tests. */
  now?: number;
}) {
  const { provider, compact } = props;
  const now = useQuotaClock(props.now);
  const quota = provider.quota;
  if (!quota || quota.windows.length === 0) {
    return null;
  }

  const filtered = filterNonOverageWindows(quota.windows);
  if (filtered.length === 0) {
    return null;
  }

  const windows = orderQuotaWindows(filtered, now);
  const worst = leastHeadroomQuotaWindow(filtered, now);
  const isExhausted = quota.status === "exhausted" || worst?.exhausted === true;
  const alarming = worst ? isQuotaAlarming(quota, worst, now) : false;

  const label = provider.displayName ?? provider.instanceId;

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
      <div className="flex items-center justify-between gap-3">
        <div className={cn("font-medium text-foreground", compact ? "text-[11px]" : "text-xs")}>
          {label}
        </div>
        {quota.planType ? (
          <div
            className={cn(
              "text-muted-foreground/70 capitalize",
              compact ? "text-[10px]" : "text-[11px]",
            )}
          >
            {quota.planType}
          </div>
        ) : null}
      </div>

      {windows.map((window) => {
        const windowRemaining = quotaRemainingPercent(window);
        const percentLabel = formatPercentage(windowRemaining) ?? "0%";
        const resetsIn = formatResetsIn(window.resetsAt, now);

        return (
          <div key={window.id} className="flex flex-col gap-1">
            <div
              className={cn(
                "flex items-center justify-between gap-3 leading-4",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              <span className="text-muted-foreground/60">{window.label}</span>
              <span
                className="font-medium tabular-nums"
                style={{ color: quotaRemainingColor(windowRemaining) }}
              >
                {percentLabel} left
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
              <div
                className={cn(
                  "leading-4 text-muted-foreground/50",
                  compact ? "text-[10px]" : "text-[11px]",
                )}
              >
                {resetsIn}
              </div>
            ) : null}
          </div>
        );
      })}

      {isExhausted ? (
        <div
          className={cn(
            "text-pretty font-medium text-red-500",
            compact ? "text-[10px]" : "mt-1 text-[11px]",
          )}
        >
          This limit has been reached.
        </div>
      ) : alarming ? (
        <div
          className={cn(
            "text-pretty font-medium text-muted-foreground/70",
            compact ? "text-[10px]" : "mt-1 text-[11px]",
          )}
        >
          Running low.
        </div>
      ) : null}
    </div>
  );
}
