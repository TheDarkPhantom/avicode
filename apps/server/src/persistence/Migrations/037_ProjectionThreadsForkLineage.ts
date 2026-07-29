import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";

/**
 * Avi Code addition: conversation branching.
 *
 * A thread created by editing (or retrying) an earlier message records where it
 * branched from. `fork_parent_thread_id` is the thread it was forked out of and
 * `fork_point_message_id` is the user message that was replaced — the branch
 * inherits every message strictly before it.
 *
 * Both stay NULL for ordinary root threads, so existing rows need no backfill.
 * The index supports the sibling lookup the timeline does on every render
 * ("which branches exist at this fork point?").
 */
export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const columns = yield* sql<{ readonly name: string }>`
    PRAGMA table_info(projection_threads)
  `;

  if (!columns.some((column) => column.name === "fork_parent_thread_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_parent_thread_id TEXT
    `;
  }

  if (!columns.some((column) => column.name === "fork_point_message_id")) {
    yield* sql`
      ALTER TABLE projection_threads
      ADD COLUMN fork_point_message_id TEXT
    `;
  }

  yield* sql`
    CREATE INDEX IF NOT EXISTS idx_projection_threads_fork_parent
    ON projection_threads (fork_parent_thread_id, fork_point_message_id)
  `;
});
