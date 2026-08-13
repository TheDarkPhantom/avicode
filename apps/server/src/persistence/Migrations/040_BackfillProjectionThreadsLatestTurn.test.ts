import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("040_BackfillProjectionThreadsLatestTurn", (it) => {
  it.effect("restores the newest surviving turn without touching empty threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 39 });

      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          interaction_mode, branch, worktree_path, latest_turn_id,
          created_at, updated_at, deleted_at
        ) VALUES
          ('thread-turns', 'project-1', 'Turns', '{}', 'approval-required', 'plan',
           NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL),
          ('thread-empty', 'project-1', 'Empty', '{}', 'approval-required', 'default',
           NULL, NULL, NULL, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', NULL)
      `;
      yield* sql`
        INSERT INTO projection_turns (
          thread_id, turn_id, state, requested_at, completed_at, checkpoint_files_json
        ) VALUES
          ('thread-turns', 'turn-old', 'completed', '2026-01-01T00:01:00.000Z',
           '2026-01-01T00:02:00.000Z', '[]'),
          ('thread-turns', 'turn-new', 'completed', '2026-01-01T00:03:00.000Z',
           '2026-01-01T00:04:00.000Z', '[]')
      `;

      yield* runMigrations({ toMigrationInclusive: 40 });

      const rows = yield* sql<{ readonly threadId: string; readonly latestTurnId: string | null }>`
        SELECT thread_id AS "threadId", latest_turn_id AS "latestTurnId"
        FROM projection_threads
        ORDER BY thread_id
      `;
      assert.deepStrictEqual(rows, [
        { threadId: "thread-empty", latestTurnId: null },
        { threadId: "thread-turns", latestTurnId: "turn-new" },
      ]);
    }),
  );
});
