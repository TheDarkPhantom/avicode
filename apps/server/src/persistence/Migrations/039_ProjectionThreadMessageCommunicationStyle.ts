import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Avi Code addition. Records which communication style a user turn was sent
 * with, so the timeline can explain why a reply reads the way it does. NULL is
 * the Default style, which is every row that existed before this migration.
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    ALTER TABLE projection_thread_messages
    ADD COLUMN communication_style TEXT NULL
  `;
});
