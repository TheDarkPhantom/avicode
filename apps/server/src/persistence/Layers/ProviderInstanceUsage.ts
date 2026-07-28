import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as SqlSchema from "effect/unstable/sql/SqlSchema";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";

import { toPersistenceDecodeError, toPersistenceSqlError } from "../Errors.ts";

import {
  DeleteProviderInstanceUsageInput,
  ProviderInstanceUsageRepository,
  type ProviderInstanceUsageRepositoryShape,
  ProviderInstanceUsageRow,
  ProviderInstanceUsageTotals,
  SummarizeProviderInstanceUsageInput,
} from "../Services/ProviderInstanceUsage.ts";

function toPersistenceSqlOrDecodeError(sqlOperation: string, decodeOperation: string) {
  return (cause: unknown) =>
    Schema.isSchemaError(cause)
      ? toPersistenceDecodeError(decodeOperation)(cause)
      : toPersistenceSqlError(sqlOperation)(cause);
}

const makeProviderInstanceUsageRepository = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  const recordProviderInstanceUsageRow = SqlSchema.void({
    Request: ProviderInstanceUsageRow,
    execute: (row) =>
      sql`
        INSERT INTO provider_instance_usage (
          turn_id,
          thread_id,
          provider_instance_id,
          driver_kind,
          model,
          input_tokens,
          cached_input_tokens,
          cache_creation_input_tokens,
          output_tokens,
          reasoning_output_tokens,
          cost_usd,
          duration_ms,
          created_at
        )
        VALUES (
          ${row.turnId},
          ${row.threadId},
          ${row.providerInstanceId},
          ${row.driverKind},
          ${row.model},
          ${row.inputTokens},
          ${row.cachedInputTokens},
          ${row.cacheCreationInputTokens},
          ${row.outputTokens},
          ${row.reasoningOutputTokens},
          ${row.costUsd},
          ${row.durationMs},
          ${row.createdAt}
        )
        ON CONFLICT (turn_id)
        DO UPDATE SET
          thread_id = excluded.thread_id,
          provider_instance_id = excluded.provider_instance_id,
          driver_kind = excluded.driver_kind,
          model = excluded.model,
          input_tokens = excluded.input_tokens,
          cached_input_tokens = excluded.cached_input_tokens,
          cache_creation_input_tokens = excluded.cache_creation_input_tokens,
          output_tokens = excluded.output_tokens,
          reasoning_output_tokens = excluded.reasoning_output_tokens,
          cost_usd = excluded.cost_usd,
          duration_ms = excluded.duration_ms,
          created_at = excluded.created_at
      `,
  });

  const summarizeProviderInstanceUsageRows = SqlSchema.findAll({
    Request: SummarizeProviderInstanceUsageInput,
    Result: ProviderInstanceUsageTotals,
    // `SUM(cost_usd)` is null exactly when no row in the group reported a
    // cost, which is the distinction the UI needs: "$0.00 spent" and "this
    // provider does not report spend" are different statements.
    execute: ({ since }) =>
      sql`
        SELECT
          provider_instance_id AS "providerInstanceId",
          driver_kind AS "driverKind",
          model,
          COUNT(*) AS "turns",
          SUM(input_tokens) AS "inputTokens",
          SUM(cached_input_tokens) AS "cachedInputTokens",
          SUM(cache_creation_input_tokens) AS "cacheCreationInputTokens",
          SUM(output_tokens) AS "outputTokens",
          SUM(reasoning_output_tokens) AS "reasoningOutputTokens",
          SUM(cost_usd) AS "costUsd"
        FROM provider_instance_usage
        WHERE ${since === undefined ? sql`1 = 1` : sql`created_at >= ${since}`}
        GROUP BY provider_instance_id, driver_kind, model
        ORDER BY provider_instance_id ASC, model ASC
      `,
  });

  const deleteProviderInstanceUsageRows = SqlSchema.void({
    Request: DeleteProviderInstanceUsageInput,
    execute: ({ threadId }) =>
      sql`
        DELETE FROM provider_instance_usage
        WHERE thread_id = ${threadId}
      `,
  });

  const record: ProviderInstanceUsageRepositoryShape["record"] = (row) =>
    recordProviderInstanceUsageRow(row).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProviderInstanceUsageRepository.record:query",
          "ProviderInstanceUsageRepository.record:encodeRequest",
        ),
      ),
    );

  const summarize: ProviderInstanceUsageRepositoryShape["summarize"] = (input) =>
    summarizeProviderInstanceUsageRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlOrDecodeError(
          "ProviderInstanceUsageRepository.summarize:query",
          "ProviderInstanceUsageRepository.summarize:decodeRows",
        ),
      ),
    );

  const deleteByThreadId: ProviderInstanceUsageRepositoryShape["deleteByThreadId"] = (input) =>
    deleteProviderInstanceUsageRows(input).pipe(
      Effect.mapError(
        toPersistenceSqlError("ProviderInstanceUsageRepository.deleteByThreadId:query"),
      ),
    );

  return {
    record,
    summarize,
    deleteByThreadId,
  } satisfies ProviderInstanceUsageRepositoryShape;
});

export const ProviderInstanceUsageRepositoryLive = Layer.effect(
  ProviderInstanceUsageRepository,
  makeProviderInstanceUsageRepository,
);
