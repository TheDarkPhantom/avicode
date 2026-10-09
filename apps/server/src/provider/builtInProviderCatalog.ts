import type { ProviderDriverKind, ProviderInstanceId, ServerProvider } from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";
import type { ServerProviderShape } from "./Services/ServerProvider.ts";

export type ProviderSnapshotSource = {
  /**
   * Routing key — uniquely identifies this instance in the aggregated
   * snapshot list. Two different snapshot sources may share the same
   * driver kind (multiple instances of the same driver).
   */
  readonly instanceId: ProviderInstanceId;
  /** Driver implementation kind. */
  readonly driverKind: ProviderDriverKind;
  readonly getSnapshot: ServerProviderShape["getSnapshot"];
  readonly refresh: ServerProviderShape["refresh"];
  /** Drops the instance's cached probe results before a fresh refresh. */
  readonly invalidateCaches?: Effect.Effect<void>;
  readonly streamChanges: Stream.Stream<ServerProvider>;
};
