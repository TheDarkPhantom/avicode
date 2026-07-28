/**
 * ProviderInstanceUsageRepository - per-turn token/cost accounting.
 *
 * One row per completed turn, attributed to the provider instance that served
 * it. Rows are additive deltas, so summing them is meaningful — unlike
 * `ThreadTokenUsageSnapshot`, whose fields are provider-specific gauges.
 *
 * @module ProviderInstanceUsageRepository
 */
import {
  IsoDateTime,
  NonNegativeInt,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";

import type { ProjectionRepositoryError } from "../Errors.ts";

export const ProviderInstanceUsageRow = Schema.Struct({
  turnId: TurnId,
  threadId: ThreadId,
  providerInstanceId: ProviderInstanceId,
  driverKind: ProviderDriverKind,
  model: Schema.NullOr(TrimmedNonEmptyString),
  inputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  cacheCreationInputTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  reasoningOutputTokens: NonNegativeInt,
  /** Null for providers that do not report spend; never locally estimated. */
  costUsd: Schema.NullOr(Schema.Number),
  durationMs: Schema.NullOr(NonNegativeInt),
  createdAt: IsoDateTime,
});
export type ProviderInstanceUsageRow = typeof ProviderInstanceUsageRow.Type;

export const SummarizeProviderInstanceUsageInput = Schema.Struct({
  /** Inclusive lower bound on `createdAt`. Omit for all-time totals. */
  since: Schema.optional(IsoDateTime),
});
export type SummarizeProviderInstanceUsageInput = typeof SummarizeProviderInstanceUsageInput.Type;

/**
 * Totals for one (instance, model) pair. Callers roll these up per instance;
 * keeping the model dimension here is what lets the UI show a breakdown
 * without a second query.
 */
export const ProviderInstanceUsageTotals = Schema.Struct({
  providerInstanceId: ProviderInstanceId,
  driverKind: ProviderDriverKind,
  model: Schema.NullOr(TrimmedNonEmptyString),
  turns: NonNegativeInt,
  inputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  cacheCreationInputTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  reasoningOutputTokens: NonNegativeInt,
  /** Null when no row in the group reported a cost. */
  costUsd: Schema.NullOr(Schema.Number),
});
export type ProviderInstanceUsageTotals = typeof ProviderInstanceUsageTotals.Type;

export const DeleteProviderInstanceUsageInput = Schema.Struct({
  threadId: ThreadId,
});
export type DeleteProviderInstanceUsageInput = typeof DeleteProviderInstanceUsageInput.Type;

/**
 * ProviderInstanceUsageRepositoryShape - Service API for usage accounting.
 */
export interface ProviderInstanceUsageRepositoryShape {
  /**
   * Insert or replace one turn's usage.
   *
   * Upserts by `turnId` so a replayed `turn.completed` — from event log
   * reprocessing or a provider re-emitting — corrects the row rather than
   * double-counting it.
   */
  readonly record: (
    row: ProviderInstanceUsageRow,
  ) => Effect.Effect<void, ProjectionRepositoryError>;

  /**
   * Aggregate totals grouped by (instance, model).
   */
  readonly summarize: (
    input: SummarizeProviderInstanceUsageInput,
  ) => Effect.Effect<ReadonlyArray<ProviderInstanceUsageTotals>, ProjectionRepositoryError>;

  /**
   * Drop a thread's usage rows, for when the thread itself is deleted.
   */
  readonly deleteByThreadId: (
    input: DeleteProviderInstanceUsageInput,
  ) => Effect.Effect<void, ProjectionRepositoryError>;
}

/**
 * ProviderInstanceUsageRepository - Service tag for usage accounting.
 */
export class ProviderInstanceUsageRepository extends Context.Service<
  ProviderInstanceUsageRepository,
  ProviderInstanceUsageRepositoryShape
>()("t3/persistence/Services/ProviderInstanceUsage/ProviderInstanceUsageRepository") {}
