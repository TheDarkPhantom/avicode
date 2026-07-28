import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Per-turn token and cost accounting, attributed to the provider instance
 * that served the turn.
 *
 * Keyed by `turn_id` so a replayed or re-ingested `turn.completed` upserts in
 * place instead of double-counting. Every token column is an additive per-turn
 * delta — see `ProviderTurnUsage` — which is what makes `SUM()` over this
 * table meaningful. Plan quota lives nowhere near here: it is a gauge, kept
 * only as a latest-value snapshot on `ServerProvider`.
 *
 * `cost_usd` is nullable because only Claude reports spend; Codex reports
 * none and it is never estimated locally.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;

  yield* sql`
    CREATE TABLE IF NOT EXISTS provider_instance_usage (
      turn_id TEXT PRIMARY KEY,
      thread_id TEXT NOT NULL,
      provider_instance_id TEXT NOT NULL,
      driver_kind TEXT NOT NULL,
      model TEXT,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      cached_input_tokens INTEGER NOT NULL DEFAULT 0,
      cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      reasoning_output_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL,
      duration_ms INTEGER,
      created_at TEXT NOT NULL
    )
  `;

  // Every read is "totals for an instance, optionally since a cutoff".
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_instance_usage_instance_created
    ON provider_instance_usage (provider_instance_id, created_at)
  `;

  // Supports clearing a thread's usage alongside its other projections.
  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_provider_instance_usage_thread
    ON provider_instance_usage (thread_id)
  `;
});
