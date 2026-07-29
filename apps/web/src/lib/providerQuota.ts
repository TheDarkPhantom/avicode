import {
  mostConstrainedQuotaWindow,
  type ProviderQuotaSnapshot,
  type ProviderQuotaWindow,
  type ServerProvider,
} from "@t3tools/contracts";

export { mostConstrainedQuotaWindow };

/**
 * Percentage past which the meter turns red.
 *
 * Matches `ContextWindowMeter`'s threshold so the two rings escalate together
 * rather than one crying wolf before the other.
 */
export const QUOTA_WARNING_PERCENT = 90;

/**
 * Resolve the quota to display for a thread.
 *
 * Keys off the *instance*, not the driver: the entire point of this feature is
 * that `codex_work` and `codex_personal` have separate allowances, so anything
 * that collapses to a driver kind would show one instance's numbers under the
 * other's name.
 */
export function selectProviderQuota(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: string | null | undefined,
): ProviderQuotaSnapshot | null {
  if (!instanceId) {
    return null;
  }
  const provider = providers.find((candidate) => candidate.instanceId === instanceId);
  const quota = provider?.quota;
  // An empty window set is "nothing to show", not "0% used" — callers hide the
  // meter rather than render an empty ring.
  return quota && quota.windows.length > 0 ? quota : null;
}

/**
 * The instance's own label, falling back to its id.
 *
 * Deliberately not the per-driver display name: two instances of one driver
 * must stay distinguishable here.
 */
export function selectProviderInstanceLabel(
  providers: ReadonlyArray<ServerProvider>,
  instanceId: string | null | undefined,
): string | null {
  if (!instanceId) {
    return null;
  }
  const provider = providers.find((candidate) => candidate.instanceId === instanceId);
  return provider ? (provider.displayName ?? provider.instanceId) : null;
}

/**
 * Human phrasing for how long until a window rolls over.
 *
 * Rounds down deliberately — "resets in 2h" arriving slightly late is
 * forgivable, promising a reset that has not happened yet is not.
 */
export function formatResetsIn(resetsAt: string | undefined, now: number): string | null {
  if (!resetsAt) {
    return null;
  }
  const target = Date.parse(resetsAt);
  if (Number.isNaN(target)) {
    return null;
  }

  const remainingMs = target - now;
  if (remainingMs <= 0) {
    return "resets now";
  }

  const totalMinutes = Math.floor(remainingMs / 60_000);
  if (totalMinutes < 1) {
    return "resets in under a minute";
  }
  if (totalMinutes < 60) {
    return `resets in ${totalMinutes}m`;
  }

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) {
    const minutes = totalMinutes % 60;
    return minutes === 0 ? `resets in ${totalHours}h` : `resets in ${totalHours}h ${minutes}m`;
  }

  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  return hours === 0 ? `resets in ${days}d` : `resets in ${days}d ${hours}h`;
}

/**
 * Whether the meter should render in its alarm state.
 *
 * Two independent triggers, because they mean different things: the provider
 * explicitly saying a limit is reached is authoritative, while crossing
 * `QUOTA_WARNING_PERCENT` is our own early warning for a limit that is close
 * but not yet enforced.
 *
 * Pure and exported so it can be tested directly — the popover body that shows
 * the warning text renders lazily on open and so is invisible to static
 * markup assertions.
 */
export function isQuotaAlarming(
  quota: ProviderQuotaSnapshot,
  window: ProviderQuotaWindow,
): boolean {
  return (
    quota.status === "exhausted" ||
    window.exhausted === true ||
    window.usedPercent > QUOTA_WARNING_PERCENT
  );
}

/**
 * How much of a window's allowance is left.
 *
 * The meter is framed as remaining rather than used because that is the
 * question being asked at a glance — "how much have I got left" — and because
 * a bar that drains reads as depletion without needing a label.
 */
export function quotaRemainingPercent(window: ProviderQuotaWindow): number {
  return Math.max(0, Math.min(100, 100 - window.usedPercent));
}

/**
 * Hue for a remaining level, sweeping green → yellow → red as it drains.
 *
 * Interpolating hue (rather than blending two RGB endpoints) is what keeps the
 * midrange vivid: a straight green-to-red blend passes through a muddy brown,
 * whereas sweeping 140°→0° passes through a clean yellow at ~43% remaining.
 */
const quotaHue = (remainingPercent: number): number =>
  (Math.max(0, Math.min(100, remainingPercent)) / 100) * 140;

/**
 * Fill for the remaining-allowance bar.
 *
 * A vertical gradient within the fill — lighter at the top, deeper at the
 * bottom — so the bar reads as a column of liquid rather than a flat block.
 * Both stops share the level's hue, so the whole bar still reads as one
 * colour at a glance.
 */
export function quotaRemainingGradient(remainingPercent: number): string {
  const hue = quotaHue(remainingPercent).toFixed(1);
  return `linear-gradient(to bottom, hsl(${hue} 95% 60%), hsl(${hue} 90% 45%))`;
}

/** Flat colour at a remaining level, for text and dots that cannot carry a gradient. */
export function quotaRemainingColor(remainingPercent: number): string {
  return `hsl(${quotaHue(remainingPercent).toFixed(1)} 90% 50%)`;
}

/**
 * Windows ordered for display: most-constrained first, so the number that
 * matters is the one the eye lands on.
 */
export function orderQuotaWindows(
  windows: ReadonlyArray<ProviderQuotaWindow>,
): ReadonlyArray<ProviderQuotaWindow> {
  return [...windows].toSorted(
    (left, right) => right.usedPercent - left.usedPercent || left.label.localeCompare(right.label),
  );
}

/**
 * One-line quota summary for a settings row, e.g.
 * `"Weekly 38% left · resets in 3d 4h"`.
 *
 * Phrased as remaining to match the composer meter — the two must not disagree
 * about whether a number means spent or left.
 *
 * Names only the most-constrained window: a settings list needs the number
 * that will bite first, and the full per-window breakdown lives in the
 * composer meter's popover.
 */
export function formatQuotaSummaryLine(
  quota: ProviderQuotaSnapshot | null | undefined,
  now: number,
): string | null {
  const worst = quota ? mostConstrainedQuotaWindow(quota.windows) : null;
  if (!worst) {
    return null;
  }

  const remaining = quotaRemainingPercent(worst);
  const percent =
    remaining < 10 ? `${remaining.toFixed(1).replace(/\.0$/, "")}%` : `${Math.round(remaining)}%`;
  const resetsIn = formatResetsIn(worst.resetsAt, now);
  return resetsIn
    ? `${worst.label} ${percent} left · ${resetsIn}`
    : `${worst.label} ${percent} left`;
}

/**
 * Format spend for display. Null means the provider does not report cost at
 * all, which renders as an em dash rather than a misleading `$0.00`.
 */
export function formatQuotaCost(costUsd: number | null | undefined): string {
  if (costUsd === null || costUsd === undefined || !Number.isFinite(costUsd)) {
    return "—";
  }
  if (costUsd > 0 && costUsd < 0.01) {
    return "<$0.01";
  }
  return `$${costUsd.toFixed(2)}`;
}
