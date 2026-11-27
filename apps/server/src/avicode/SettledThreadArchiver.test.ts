import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { selectArchivableSettledThreadIds } from "./SettledThreadArchiver.ts";

const encodePayload = Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown));

it.effect("picks threads settled before the cutoff that no scheduled task posts into", () =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const at = (day: number) => `2026-11-${String(day).padStart(2, "0")}T00:00:00.000Z`;
    const settled = (day: number) => ({ settledOverride: "settled", settledAt: at(day) });
    const fixtures = [
      { id: "settled-old", payload: settled(2) },
      { id: "settled-oldest", payload: settled(1) },
      { id: "settled-recent", payload: settled(20) },
      { id: "active", payload: { settledOverride: "active", settledAt: at(1) } },
      { id: "unsettled", payload: { settledOverride: null, settledAt: null } },
      { id: "scheduled", payload: settled(1) },
      { id: "archived", payload: settled(1), archived: true },
      { id: "deleted", payload: settled(1), deleted: true },
      { id: "side-chat", payload: { ...settled(1), lineage: { sideChat: true } } },
      {
        id: "subagent",
        payload: { ...settled(1), lineage: { relationshipToParent: "subagent" } },
      },
    ];
    for (const fixture of fixtures) {
      const payload = yield* encodePayload(fixture.payload);
      yield* sql`
        INSERT INTO orchestration_v2_projection_threads (
          thread_id, project_id, title, default_provider, runtime_mode, interaction_mode,
          created_at, updated_at, archived_at, deleted_at, payload_json
        ) VALUES (
          ${fixture.id}, 'project-1', ${fixture.id}, 'codex', 'full-access', 'default',
          ${at(1)}, ${at(1)}, ${fixture.archived ? at(3) : null},
          ${fixture.deleted ? at(3) : null}, ${payload}
        )
      `;
    }
    yield* sql`
      INSERT INTO scheduled_tasks (
        task_id, title, prompt, enabled, schedule_json, project_id, thread_id,
        workspace_strategy_json, model_selection_json, runtime_mode, interaction_mode,
        created_by, creation_source, created_at, updated_at, last_run_status, run_count
      ) VALUES (
        'task-1', 'Daily', 'Check in', 0, '{}', 'project-1', 'scheduled',
        '{}', '{}', 'full-access', 'default', 'user', 'user', ${at(1)}, ${at(1)}, 'never', 0
      )
    `;

    expect(yield* selectArchivableSettledThreadIds(at(14))).toEqual([
      "settled-oldest",
      "settled-old",
    ]);
  }).pipe(Effect.provide(SqlitePersistence.layerMemory)),
);
