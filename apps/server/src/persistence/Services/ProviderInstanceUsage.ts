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
  ProjectId,
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

// Avi Code addition: per-project (repo) usage.
export const SummarizeProjectUsageInput = Schema.Struct({
  /** Inclusive lower bound on `createdAt`. Omit for all-time totals. */
  since: Schema.optional(IsoDateTime),
});
export type SummarizeProjectUsageInput = typeof SummarizeProjectUsageInput.Type;

/**
 * Avi Code addition: totals for one (project, instance, model) triple.
 *
 * `provider_instance_usage` joins to the thread's project, so a repo's spend
 * can be broken down by the credentials that served it. `projectTitle` and
 * `workspaceRoot` come from the projects projection and are null when that row
 * is gone. Same null-cost semantics as `ProviderInstanceUsageTotals`.
 */
export const ProjectUsageTotals = Schema.Struct({
  projectId: ProjectId,
  projectTitle: Schema.NullOr(Schema.String),
  workspaceRoot: Schema.NullOr(Schema.String),
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
export type ProjectUsageTotals = typeof ProjectUsageTotals.Type;

// Avi Code addition: per-thread usage.
export const SummarizeThreadUsageInput = Schema.Struct({
  threadId: ThreadId,
});
export type SummarizeThreadUsageInput = typeof SummarizeThreadUsageInput.Type;

/**
 * Avi Code addition: totals for one model within a single thread.
 *
 * The thread is fixed by the query, so — unlike `ProviderInstanceUsageTotals`
 * — there is no instance/driver dimension here; the model breakdown is all the
 * thread view needs.
 */
export const ThreadUsageModelTotals = Schema.Struct({
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
export type ThreadUsageModelTotals = typeof ThreadUsageModelTotals.Type;

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
   * Avi Code addition: aggregate one thread's totals grouped by model.
   */
  readonly summarizeByThread: (
    input: SummarizeThreadUsageInput,
  ) => Effect.Effect<ReadonlyArray<ThreadUsageModelTotals>, ProjectionRepositoryError>;

  /**
   * Avi Code addition: aggregate totals grouped by (project, instance, model),
   * joining usage rows to their thread's project.
   */
  readonly summarizeByProject: (
    input: SummarizeProjectUsageInput,
  ) => Effect.Effect<ReadonlyArray<ProjectUsageTotals>, ProjectionRepositoryError>;

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
