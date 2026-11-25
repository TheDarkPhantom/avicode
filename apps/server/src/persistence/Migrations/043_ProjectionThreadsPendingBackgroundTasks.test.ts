import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as SqlClient from "effect/unstable/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import * as NodeSqliteClient from "../NodeSqliteClient.ts";
import migratePendingBackgroundTasks from "./043_ProjectionThreadsPendingBackgroundTasks.ts";

const layer = it.layer(Layer.mergeAll(NodeSqliteClient.layerMemory()));

layer("043_ProjectionThreadsPendingBackgroundTasks", (it) => {
  it.effect("adds the column with no pending tasks for existing threads", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 42 });
      const now = "2026-01-01T00:00:00.000Z";
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          created_at, updated_at
        ) VALUES (
          'thread-1', 'project-1', 'Existing thread',
          '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', ${now}, ${now}
        )
      `;
      yield* runMigrations({ toMigrationInclusive: 43 });
      const migrated = yield* sql<{ readonly ids: string }>`
        SELECT pending_background_task_ids_json AS "ids"
        FROM projection_threads
        WHERE thread_id = 'thread-1'
      `;
      assert.deepEqual(migrated, [{ ids: "[]" }]);

      // Re-running against a database that already has the column keeps its value.
      yield* sql`UPDATE projection_threads SET pending_background_task_ids_json = '["t1"]' WHERE thread_id = 'thread-1'`;
      yield* migratePendingBackgroundTasks;
      const rows = yield* sql<{ readonly ids: string }>`
        SELECT pending_background_task_ids_json AS "ids"
        FROM projection_threads
        WHERE thread_id = 'thread-1'
      `;
      assert.deepEqual(rows, [{ ids: '["t1"]' }]);
    }),
  );
});
