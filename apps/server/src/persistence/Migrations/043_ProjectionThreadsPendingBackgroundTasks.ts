import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Avi Code addition: ids of provider background tasks (a backgrounded command
 * or subagent) a thread started and the provider has not reported finished.
 * Holds the sidebar off "Completed" while the agent will still wake up.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;
  if (!columns.some((column) => column.name === "pending_background_task_ids_json")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN pending_background_task_ids_json TEXT NOT NULL DEFAULT '[]'
    `;
  }
});
