import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Avi Code addition: durable, reversible plan dismissal. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE projection_thread_proposed_plans
    ADD COLUMN discarded_at TEXT NULL
  `;
});
