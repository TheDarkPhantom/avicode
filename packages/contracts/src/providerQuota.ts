/**
 * Provider quota and per-turn usage contracts.
 *
 * Two distinct shapes live here, and conflating them is the main hazard:
 *
 *   - `ProviderQuotaSnapshot` is a **gauge**. It answers "how much of this
 *     instance's plan allowance is currently spent, and when does it reset?".
 *     Providers report it as a percentage of an opaque server-side budget; we
 *     never compute it ourselves. Summing snapshots is meaningless.
 *
 *   - `ProviderTurnUsage` is a **counter delta**. It is the additive token and
 *     cost cost of exactly one completed turn, and rows of it can be summed.
 *
 * Adapters are responsible for normalizing their provider's native shape into
 * these, mirroring how `ThreadTokenUsageSnapshot` is already normalized per
 * adapter. The contracts layer stays provider-agnostic.
 *
 * @module providerQuota
 */
import * as Schema from "effect/Schema";
import { IsoDateTime, NonNegativeInt, TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Stable identifier for a quota window within one provider instance.
 *
 * Deliberately an open string rather than a literal union: the set of windows
 * is provider-defined and changes without our involvement (Claude alone ships
 * `five_hour`, `seven_day`, `seven_day_opus`, `seven_day_sonnet`, `overage`,
 * and adds more over time). Unknown ids render generically rather than
 * failing to decode.
 *
 * Ids are the **merge key** — see `mergeProviderQuotaWindows`.
 */
export const ProviderQuotaWindowId = TrimmedNonEmptyString;
export type ProviderQuotaWindowId = typeof ProviderQuotaWindowId.Type;

/**
 * Percentage of a window's allowance consumed, 0-100.
 *
 * Adapters must clamp into range before constructing a window: providers can
 * report past 100 once a limit is breached, and letting that reach the schema
 * would fail the decode and blank the meter at exactly the moment it matters
 * most. Use `clampQuotaUsedPercent`.
 */
export const ProviderQuotaUsedPercent = Schema.Number.check(
  Schema.isBetween({ minimum: 0, maximum: 100 }),
);
export type ProviderQuotaUsedPercent = typeof ProviderQuotaUsedPercent.Type;

/**
 * Coerce a provider-reported percentage into the 0-100 the schema accepts.
 * Non-finite input yields `null` so callers can drop the window entirely
 * rather than render a misleading zero.
 */
export const clampQuotaUsedPercent = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : null;

/**
 * One rate-limit window (e.g. Codex's rolling 5-hour, Claude's 7-day).
 */
export const ProviderQuotaWindow = Schema.Struct({
  id: ProviderQuotaWindowId,
  /** Human-facing label chosen by the adapter, e.g. "5-hour", "Weekly (Opus)". */
  label: TrimmedNonEmptyString,
  usedPercent: ProviderQuotaUsedPercent,
  /** When the window rolls over. Absent when the provider does not say. */
  resetsAt: Schema.optional(IsoDateTime),
  /** Nominal window length, used to label windows the provider only sizes numerically. */
  windowMinutes: Schema.optional(NonNegativeInt),
  /** True once the provider has started rejecting requests against this window. */
  exhausted: Schema.optional(Schema.Boolean),
});
export type ProviderQuotaWindow = typeof ProviderQuotaWindow.Type;

/**
 * Overall posture across every window, as reported by the provider. Derived
 * separately from `usedPercent` because providers reject on their own
 * thresholds, which do not always correspond to 100%.
 */
export const ProviderQuotaStatus = Schema.Literals(["ok", "warning", "exhausted"]);
export type ProviderQuotaStatus = typeof ProviderQuotaStatus.Type;

/**
 * Last-known quota state for one provider instance.
 *
 * Not persisted as history — only the latest snapshot per instance is kept.
 */
export const ProviderQuotaSnapshot = Schema.Struct({
  windows: Schema.Array(ProviderQuotaWindow),
  /** Provider plan name when known, e.g. "pro", "max", "team". */
  planType: Schema.optional(TrimmedNonEmptyString),
  status: Schema.optional(ProviderQuotaStatus),
  capturedAt: IsoDateTime,
});
export type ProviderQuotaSnapshot = typeof ProviderQuotaSnapshot.Type;

/**
 * Merge freshly-reported windows into the previously-known set, keyed by id.
 *
 * Patch semantics are mandatory, not a convenience: Codex pushes its full
 * window set on every notification, but Claude's `rate_limit_event` carries
 * exactly one window at a time. Replacing wholesale on a Claude event would
 * make the 5-hour and weekly readings flap, each erasing the other.
 *
 * Incoming windows win on conflict, and window order is stable: existing ids
 * keep their position, genuinely new ids append.
 */
export const mergeProviderQuotaWindows = (
  previous: ReadonlyArray<ProviderQuotaWindow>,
  incoming: ReadonlyArray<ProviderQuotaWindow>,
): ReadonlyArray<ProviderQuotaWindow> => {
  if (previous.length === 0) {
    return incoming;
  }
  const incomingById = new Map(incoming.map((window) => [window.id, window]));
  const merged = previous.map((window) => incomingById.get(window.id) ?? window);
  const seen = new Set(previous.map((window) => window.id));
  return [...merged, ...incoming.filter((window) => !seen.has(window.id))];
};

/**
 * Merge a newly-captured snapshot onto the previous one for the same instance.
 *
 * `planType` and `status` are only overwritten when the incoming snapshot
 * actually carries them — Claude's per-window events know neither.
 */
export const mergeProviderQuotaSnapshots = (
  previous: ProviderQuotaSnapshot | undefined,
  incoming: ProviderQuotaSnapshot,
): ProviderQuotaSnapshot => {
  if (!previous) {
    return incoming;
  }
  const planType = incoming.planType ?? previous.planType;
  const status = incoming.status ?? previous.status;
  return {
    windows: mergeProviderQuotaWindows(previous.windows, incoming.windows),
    ...(planType !== undefined ? { planType } : {}),
    ...(status !== undefined ? { status } : {}),
    capturedAt: incoming.capturedAt,
  };
};

/**
 * The window closest to running out — what a single-ring meter should show.
 *
 * Returns `null` for an empty window set so callers can hide the meter rather
 * than render an empty ring.
 */
export const mostConstrainedQuotaWindow = (
  windows: ReadonlyArray<ProviderQuotaWindow>,
): ProviderQuotaWindow | null =>
  windows.reduce<ProviderQuotaWindow | null>(
    (worst, window) => (worst === null || window.usedPercent > worst.usedPercent ? window : worst),
    null,
  );

/**
 * Additive token and cost usage for exactly one completed turn.
 *
 * Every field is a per-turn delta. This is deliberately *not*
 * `ThreadTokenUsageSnapshot`, whose fields mean different things per provider
 * (Codex reports per-turn deltas there, Claude reports context occupancy) and
 * so cannot be summed.
 *
 * `costUsd` is absent for providers that do not report spend — it is never
 * estimated from a local price table.
 */
export const ProviderTurnUsage = Schema.Struct({
  model: Schema.optional(TrimmedNonEmptyString),
  inputTokens: NonNegativeInt,
  cachedInputTokens: Schema.optional(NonNegativeInt),
  cacheCreationInputTokens: Schema.optional(NonNegativeInt),
  outputTokens: NonNegativeInt,
  reasoningOutputTokens: Schema.optional(NonNegativeInt),
  costUsd: Schema.optional(Schema.Number),
  durationMs: Schema.optional(NonNegativeInt),
});
export type ProviderTurnUsage = typeof ProviderTurnUsage.Type;
