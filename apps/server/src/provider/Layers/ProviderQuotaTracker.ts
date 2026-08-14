/**
 * ProviderQuotaTrackerLive - in-memory implementation of the quota tracker.
 *
 * @module ProviderQuotaTrackerLive
 */
import {
  mergeProviderQuotaSnapshots,
  type ProviderInstanceId,
  type ProviderQuotaSnapshot,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Equal from "effect/Equal";
import * as Layer from "effect/Layer";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";

import {
  ProviderQuotaTracker,
  type ProviderQuotaTrackerShape,
} from "../Services/ProviderQuotaTracker.ts";

/**
 * Compare two snapshots ignoring `capturedAt`.
 *
 * Providers re-report unchanged utilization on a timer, and every such report
 * carries a fresh timestamp. Treating those as changes would republish the
 * whole provider array to every connected client for no visible difference.
 */
const isQuotaMateriallyEqual = (
  previous: ProviderQuotaSnapshot | undefined,
  next: ProviderQuotaSnapshot,
): boolean => {
  if (!previous) {
    return false;
  }
  const { capturedAt: _previousCapturedAt, ...previousRest } = previous;
  const { capturedAt: _nextCapturedAt, ...nextRest } = next;
  return Equal.equals(previousRest, nextRest);
};

const makeProviderQuotaTracker = Effect.gen(function* () {
  const quotasRef = yield* Ref.make<ReadonlyMap<ProviderInstanceId, ProviderQuotaSnapshot>>(
    new Map(),
  );
  const changesPubSub = yield* Effect.acquireRelease(
    PubSub.unbounded<ProviderInstanceId>(),
    PubSub.shutdown,
  );

  const record: ProviderQuotaTrackerShape["record"] = (input) =>
    Effect.gen(function* () {
      const changed = yield* Ref.modify(quotasRef, (previous) => {
        const merged = input.authoritative
          ? input.quota
          : mergeProviderQuotaSnapshots(previous.get(input.instanceId), input.quota);
        if (isQuotaMateriallyEqual(previous.get(input.instanceId), merged)) {
          return [false, previous] as const;
        }
        const next = new Map(previous);
        next.set(input.instanceId, merged);
        return [true, next] as const;
      });

      if (changed) {
        yield* PubSub.publish(changesPubSub, input.instanceId);
      }
    });

  const get: ProviderQuotaTrackerShape["get"] = (instanceId) =>
    Ref.get(quotasRef).pipe(Effect.map((quotas) => quotas.get(instanceId)));

  return {
    record,
    get,
    getAll: Ref.get(quotasRef),
    changes: Stream.fromPubSub(changesPubSub),
  } satisfies ProviderQuotaTrackerShape;
});

export const ProviderQuotaTrackerLive = Layer.effect(
  ProviderQuotaTracker,
  makeProviderQuotaTracker,
);
