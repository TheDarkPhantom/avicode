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
export const PROVIDER_QUOTA_REFRESH_MAX_AGE_MS = 5 * 60 * 1_000;

export function shouldRefreshProviderQuota(
  quota: ProviderQuotaSnapshot | null | undefined,
  now = Date.now(),
): boolean {
  if (!quota || quota.windows.length === 0) return true;
  const capturedAt = Date.parse(quota.capturedAt);
  return (
    !Number.isFinite(capturedAt) ||
    capturedAt > now ||
    now - capturedAt >= PROVIDER_QUOTA_REFRESH_MAX_AGE_MS
  );
}

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
 * explicitly saying a limit is reached is authoritative, while running short on
 * headroom is our own early warning for a limit that is close but not yet
 * enforced.
 *
 * The early warning is measured against headroom rather than raw usage so a
 * window that is nearly spent but about to roll over stops crying wolf. Both
 * authoritative triggers ignore time entirely: a provider that is rejecting
 * requests right now is doing so regardless of when the window resets.
 *
 * Pure and exported so it can be tested directly — the popover body that shows
 * the warning text renders lazily on open and so is invisible to static
 * markup assertions.
 */
export function isQuotaAlarming(
  quota: ProviderQuotaSnapshot,
  window: ProviderQuotaWindow,
  now: number,
): boolean {
  return (
    quota.status === "exhausted" ||
    window.exhausted === true ||
    quotaHeadroomPercent(window, now) < 100 - QUOTA_WARNING_PERCENT
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
  // A provider rejection is authoritative. Utilization is often rounded or
  // sampled just before enforcement, so an exhausted window can still arrive
  // as 99% used. Calling that "1% left" contradicts the provider and the
  // request failure the person just saw.
  if (window.exhausted === true) {
    return 0;
  }
  return Math.max(0, Math.min(100, 100 - window.usedPercent));
}

/**
 * How much of a window's span is still ahead, as a 0-1 fraction.
 *
 * Null when the provider did not report enough to say — every caller treats
 * that as "no time information" and falls back to the raw percentage rather
 * than guessing a window length.
 */
function quotaWindowTimeLeftFraction(window: ProviderQuotaWindow, now: number): number | null {
  const { windowMinutes, resetsAt } = window;
  if (windowMinutes === undefined || windowMinutes <= 0 || resetsAt === undefined) {
    return null;
  }
  const resetsAtMs = Date.parse(resetsAt);
  if (Number.isNaN(resetsAtMs)) {
    return null;
  }
  const msLeft = resetsAtMs - now;
  if (msLeft <= 0) {
    return 0;
  }
  // Clamped at a full window: clock skew can put a reset further out than the
  // window is long, and a fraction above 1 would understate the headroom.
  return Math.min(1, msLeft / (windowMinutes * 60_000));
}

/**
 * What an allowance is worth given the time it still has to cover, as an
 * equivalent percentage of a fresh window.
 *
 * An allowance is only scarce relative to how long it has to last. Raw
 * remaining percentage ignores that and so misreads the common case badly: a
 * weekly window at 38% left with one day of seven still to run is not a
 * constraint at all, but it reads as one, and it will out-scare a 5-hour window
 * at 89% that is the limit actually governing the next few hours. Projecting
 * the remainder across the whole window — 38% spread over the final 15% of the
 * week is worth more than a full fresh window — puts the two on comparable
 * footing.
 *
 * Degrades to `quotaRemainingPercent` whenever the provider reports no window
 * length or reset time, so nothing regresses for a provider that says less.
 */
export function quotaHeadroomPercent(window: ProviderQuotaWindow, now: number): number {
  return Math.min(100, quotaHeadroomRatio(window, now));
}

/**
 * Headroom before it is capped at a full window.
 *
 * Ranking needs the uncapped value. Several windows can be comfortably ahead at
 * once, and capping first would tie them all at 100 and hand the decision to an
 * arbitrary tiebreak — which is how a weekly cap resetting within the hour ends
 * up named as the active constraint over a 5-hour window that genuinely is one.
 * Display uses the capped form, because a bar cannot be more than full.
 */
function quotaHeadroomRatio(window: ProviderQuotaWindow, now: number): number {
  const remaining = quotaRemainingPercent(window);
  // Nothing left is nothing left. Notably this keeps a provider-rejected window
  // pinned at zero even once its reset time has passed: a stale snapshot should
  // fail toward "still blocked" rather than promise a refill we have not
  // confirmed.
  if (remaining === 0) {
    return 0;
  }

  const timeLeftFraction = quotaWindowTimeLeftFraction(window, now);
  if (timeLeftFraction === null) {
    return remaining;
  }
  if (timeLeftFraction === 0) {
    return Number.POSITIVE_INFINITY;
  }
  return remaining / timeLeftFraction;
}

/**
 * Order two windows by which constrains you more, most-constrained first.
 *
 * Headroom decides it; raw remaining and then the label only break genuine
 * ties, so the ordering stays stable across re-renders instead of flickering
 * between equally comfortable windows.
 */
function compareQuotaConstraint(
  left: ProviderQuotaWindow,
  right: ProviderQuotaWindow,
  now: number,
): number {
  // Two already-reset windows subtract to NaN, which is falsy and so falls
  // through to the tiebreaks rather than corrupting the sort.
  return (
    quotaHeadroomRatio(left, now) - quotaHeadroomRatio(right, now) ||
    quotaRemainingPercent(left) - quotaRemainingPercent(right) ||
    left.label.localeCompare(right.label)
  );
}

/**
 * The window that actually limits you right now — the one with least headroom.
 *
 * This is what a single-bar meter should track. It differs from
 * `mostConstrainedQuotaWindow`, which answers the narrower question of which
 * window holds the smallest raw number, and which therefore keeps naming a
 * weekly cap that is minutes from rolling over.
 *
 * Returns null for an empty window set so callers can hide the meter rather
 * than render an empty bar.
 */
export function leastHeadroomQuotaWindow(
  windows: ReadonlyArray<ProviderQuotaWindow>,
  now: number,
): ProviderQuotaWindow | null {
  return windows.reduce<ProviderQuotaWindow | null>(
    (worst, window) =>
      worst === null || compareQuotaConstraint(window, worst, now) < 0 ? window : worst,
    null,
  );
}

/**
 * One sentence reconciling a full-looking meter with a small number beneath it.
 *
 * Only appears when the window driving the meter is not the one showing the
 * lowest percentage — precisely the case where the reading looks self
 * contradictory. Without the reset time there is nothing to explain with, so it
 * says nothing rather than asserting a constraint it cannot justify.
 */
export function formatQuotaConstraintHint(
  windows: ReadonlyArray<ProviderQuotaWindow>,
  now: number,
): string | null {
  const driving = leastHeadroomQuotaWindow(windows, now);
  const lowest = mostConstrainedQuotaWindow(windows);
  if (!driving || !lowest || driving.id === lowest.id) {
    return null;
  }
  const resetsIn = formatResetsIn(lowest.resetsAt, now);
  if (!resetsIn) {
    return null;
  }
  return `${lowest.label} ${resetsIn}, so your ${driving.label} window is what limits you right now.`;
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
 *
 * Ordered by headroom rather than raw usage, which keeps the list agreeing with
 * the meter above it — the window the bar is tracking is the one at the top.
 */
export function orderQuotaWindows(
  windows: ReadonlyArray<ProviderQuotaWindow>,
  now: number,
): ReadonlyArray<ProviderQuotaWindow> {
  return [...windows].toSorted((left, right) => compareQuotaConstraint(left, right, now));
}

/**
 * One-line quota summary for a settings row, e.g.
 * `"Weekly 38% left · resets in 3d 4h"`.
 *
 * Phrased as remaining to match the composer meter — the two must not disagree
 * about whether a number means spent or left.
 *
 * Names only the window that limits you now: a settings list needs the one
 * that will bite first, and the full per-window breakdown lives in the
 * composer meter's popover. Picked the same way the composer meter picks, so
 * the two surfaces never disagree about which limit matters. The percentage
 * itself stays raw — the time maths chooses the subject, it does not restate
 * the provider's number.
 */
export function formatQuotaSummaryLine(
  quota: ProviderQuotaSnapshot | null | undefined,
  now: number,
): string | null {
  const worst = quota ? leastHeadroomQuotaWindow(quota.windows, now) : null;
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
