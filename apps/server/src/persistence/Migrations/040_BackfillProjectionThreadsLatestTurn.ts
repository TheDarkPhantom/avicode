import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/** Avi Code addition: terminal session updates used to erase this pointer. */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`
    UPDATE projection_threads
    SET latest_turn_id = (
      SELECT projection_turns.turn_id
      FROM projection_turns
      WHERE projection_turns.thread_id = projection_threads.thread_id
        AND projection_turns.turn_id IS NOT NULL
      ORDER BY projection_turns.requested_at DESC, projection_turns.row_id DESC
      LIMIT 1
    )
    WHERE latest_turn_id IS NULL
      AND EXISTS (
        SELECT 1
        FROM projection_turns
        WHERE projection_turns.thread_id = projection_threads.thread_id
          AND projection_turns.turn_id IS NOT NULL
      )
  `;
});
