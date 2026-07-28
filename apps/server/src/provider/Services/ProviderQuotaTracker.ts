/**
 * ProviderQuotaTracker - last-known plan quota per provider instance.
 *
 * Holds a small in-memory map of `ProviderInstanceId -> ProviderQuotaSnapshot`,
 * fed from `account.rate-limits.updated` runtime events and read by
 * `ProviderRegistry` when it assembles `ServerProvider` snapshots.
 *
 * Deliberately dependency-free. `ProviderService` writes to it and
 * `ProviderRegistry` reads from it; if the tracker depended on either, those
 * two would become mutually dependent through it.
 *
 * Quota is a gauge, not a log: only the latest value per instance is kept, and
 * durability comes free from the provider status cache that already persists
 * whole `ServerProvider` snapshots to disk.
 *
 * @module ProviderQuotaTracker
 */
import type { ProviderInstanceId, ProviderQuotaSnapshot } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

/**
 * ProviderQuotaTrackerShape - Service API for per-instance quota state.
 */
export interface ProviderQuotaTrackerShape {
  /**
   * Merge a newly-observed snapshot into the instance's known state.
   *
   * Merging rather than replacing is required: Claude reports one rate-limit
   * window per event, so a replace would make its 5-hour and weekly readings
   * take turns erasing each other. See `mergeProviderQuotaSnapshots`.
   *
   * Publishes to `changes` only when the merge actually altered the snapshot,
   * so repeated identical reports do not churn the provider status stream.
   */
  readonly record: (input: {
    readonly instanceId: ProviderInstanceId;
    readonly quota: ProviderQuotaSnapshot;
  }) => Effect.Effect<void>;

  /** Last-known quota for one instance, or undefined if it has never reported. */
  readonly get: (
    instanceId: ProviderInstanceId,
  ) => Effect.Effect<ProviderQuotaSnapshot | undefined>;

  /** Whole map, for callers decorating many snapshots at once. */
  readonly getAll: Effect.Effect<ReadonlyMap<ProviderInstanceId, ProviderQuotaSnapshot>>;

  /**
   * Emits the id of each instance whose quota just changed. `ProviderRegistry`
   * subscribes so a quota-only change still republishes provider snapshots —
   * without it the meter would only ever update alongside some unrelated
   * provider status change.
   */
  readonly changes: Stream.Stream<ProviderInstanceId>;
}

/**
 * ProviderQuotaTracker - Service tag for per-instance quota state.
 */
export class ProviderQuotaTracker extends Context.Service<
  ProviderQuotaTracker,
  ProviderQuotaTrackerShape
>()("t3/provider/Services/ProviderQuotaTracker") {}
