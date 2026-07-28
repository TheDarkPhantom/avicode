import type { ProviderQuotaSnapshot } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { formatPercentage } from "~/lib/contextWindow";
import {
  formatResetsIn,
  isQuotaAlarming,
  mostConstrainedQuotaWindow,
  orderQuotaWindows,
} from "~/lib/providerQuota";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * Always-visible plan-allowance meter for the thread's provider instance.
 *
 * A visual sibling of `ContextWindowMeter` — same ring, same popover — because
 * the two answer adjacent questions and sit next to each other: how full is
 * this conversation, and how much of this account's plan is left.
 *
 * The ring shows the *most constrained* window. Codex and Claude both enforce
 * several windows at once (rolling hours plus a weekly cap), and the one that
 * will actually stop you is whichever is highest; averaging them would hide
 * exactly the number that matters.
 */
export function ProviderQuotaMeter(props: {
  quota: ProviderQuotaSnapshot;
  instanceLabel?: string | null;
  /** Injected so the reset countdown is deterministic in tests. */
  now?: number;
}) {
  const { quota, instanceLabel } = props;
  const now = props.now ?? Date.now();
  const worst = mostConstrainedQuotaWindow(quota.windows);
  if (!worst) {
    return null;
  }

  const windows = orderQuotaWindows(quota.windows);
  const normalizedPercentage = Math.max(0, Math.min(100, worst.usedPercent));
  const worstPercentage = formatPercentage(worst.usedPercent) ?? "0%";
  const radius = 9.75;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference - (normalizedPercentage / 100) * circumference;
  const isExhausted = quota.status === "exhausted" || worst.exhausted === true;
  const isOverloaded = isQuotaAlarming(quota, worst);
  const usageColor = isOverloaded
    ? "var(--color-red-500)"
    : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
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
            aria-label={`${heading}: ${worstPercentage} of ${worst.label} limit used`}
          >
            <span className="relative flex size-5 items-center justify-center">
              <svg
                viewBox="0 0 24 24"
                className="-rotate-90 absolute inset-0 size-full transform-gpu"
                aria-hidden="true"
              >
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke="color-mix(in oklab, var(--color-muted-foreground) 24%, transparent)"
                  strokeWidth="3"
                  strokeDasharray="2 2"
                />
                <circle
                  cx="12"
                  cy="12"
                  r={radius}
                  fill="none"
                  stroke={usageColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>
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
            const percentage = Math.max(0, Math.min(100, window.usedPercent));
            const label = formatPercentage(window.usedPercent) ?? "0%";
            const barColor = isQuotaAlarming(quota, window)
              ? "var(--color-red-500)"
              : "color-mix(in oklab, var(--color-muted-foreground) 72%, transparent)";
            const resetsIn = formatResetsIn(window.resetsAt, now);

            return (
              <div key={window.id} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-3 text-[11px] leading-4">
                  <span className="text-muted-foreground/60">{window.label}</span>
                  <span className="font-medium tabular-nums text-muted-foreground/80">{label}</span>
                </div>
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted/60"
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(percentage)}
                  aria-label={`${window.label} limit usage`}
                >
                  <div
                    className="h-full rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none"
                    style={{ width: `${percentage}%`, backgroundColor: barColor }}
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
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
