// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, it } from "@effect/vitest";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { runMigrations } from "../Migrations.ts";
import {
  importLegacyAviCode,
  LEGACY_IMPORT_MARKER_FILE,
  LEGACY_SHARED_MIGRATION_COUNT,
} from "./legacyAviCodeImport.ts";

const FORK_MIGRATIONS = [
  [35, "ProviderInstanceUsage"],
  [36, "ProjectionThreadMessageContext"],
  [37, "ProjectionThreadsForkLineage"],
  [38, "ProjectionThreadTitleRegeneration"],
  [39, "ProjectionThreadMessageCommunicationStyle"],
  [40, "BackfillProjectionThreadsLatestTurn"],
  [41, "ProjectionThreadProposedPlanDiscardedAt"],
  [42, "ProjectionThreadsAutoSettleDisabledAt"],
] as const;

const seedLegacyDatabase = (filename: string) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    yield* runMigrations({ toMigrationInclusive: LEGACY_SHARED_MIGRATION_COUNT });
    yield* sql`ALTER TABLE projection_threads ADD COLUMN title_regeneration_request_id TEXT`;
    yield* sql`ALTER TABLE projection_threads ADD COLUMN title_regeneration_started_at TEXT`;
    yield* sql`ALTER TABLE projection_threads ADD COLUMN auto_settle_disabled_at TEXT`;
    yield* sql`ALTER TABLE projection_threads ADD COLUMN fork_parent_thread_id TEXT`;
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN thread_context_json TEXT NULL`;
    yield* sql`ALTER TABLE projection_thread_messages ADD COLUMN communication_style TEXT NULL`;
    for (const [id, name] of FORK_MIGRATIONS) {
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (${id}, ${name})`;
    }
    yield* sql`INSERT INTO projection_projects (project_id, title, workspace_root, scripts_json, created_at, updated_at)
      VALUES ('project', 'Project', '/tmp/project', '[]', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`;
    yield* sql`INSERT INTO projection_threads (thread_id, project_id, title, model_selection_json, runtime_mode, interaction_mode, created_at, updated_at, auto_settle_disabled_at, fork_parent_thread_id)
      VALUES ('thread', 'project', 'Old thread', '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', 'default', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', 'parent')`;
  }).pipe(Effect.provide(NodeSqliteClient.layer({ filename })));

const makeHome = () => {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "avicode-import-"));
  const legacy = NodePath.join(home, ".avicode", "userdata");
  NodeFS.mkdirSync(NodePath.join(legacy, "secrets"), { recursive: true });
  NodeFS.writeFileSync(NodePath.join(legacy, "settings.json"), '{"providers":{}}');
  NodeFS.writeFileSync(NodePath.join(legacy, "secrets", "key"), "secret");
  NodeFS.writeFileSync(NodePath.join(legacy, "environment-id"), "old-environment");
  return {
    home,
    legacyDatabase: NodePath.join(legacy, "state.sqlite"),
    userdata: NodePath.join(home, ".avicode2", "userdata"),
  };
};

const readLedger = (filename: string) => {
  const database = new NodeSqlite.DatabaseSync(filename, { readOnly: true });
  try {
    return database
      .prepare("SELECT migration_id AS id, name FROM effect_sql_migrations ORDER BY migration_id")
      .all() as unknown as ReadonlyArray<{ id: number; name: string }>;
  } finally {
    database.close();
  }
};

it.effect("imports the first Avi Code's history once, leaving the original untouched", () => {
  const { home, legacyDatabase, userdata } = makeHome();
  const destination = NodePath.join(userdata, "statev2.sqlite");
  return Effect.gen(function* () {
    yield* seedLegacyDatabase(legacyDatabase);
    const original = NodeFS.readFileSync(legacyDatabase);

    yield* importLegacyAviCode(destination);

    assert.deepEqual(NodeFS.readFileSync(legacyDatabase), original);
    const ledger = readLedger(destination);
    assert.equal(ledger.length, LEGACY_SHARED_MIGRATION_COUNT);
    assert.equal(ledger.at(-1)?.id, LEGACY_SHARED_MIGRATION_COUNT);
    assert.equal(
      NodeFS.readFileSync(NodePath.join(userdata, "settings.json"), "utf8"),
      '{"providers":{}}',
    );
    assert.equal(NodeFS.readFileSync(NodePath.join(userdata, "secrets", "key"), "utf8"), "secret");
    assert.isFalse(NodeFS.existsSync(NodePath.join(userdata, "environment-id")));
    const marker = JSON.parse(
      NodeFS.readFileSync(NodePath.join(userdata, LEGACY_IMPORT_MARKER_FILE), "utf8"),
    );
    assert.equal(marker.threads, 1);

    // Upstream's own migrations run over the kept fork columns.
    yield* runMigrations().pipe(Effect.provide(NodeSqliteClient.layer({ filename: destination })));
    const database = new NodeSqlite.DatabaseSync(destination, { readOnly: true });
    try {
      const thread = database
        .prepare("SELECT auto_settle_disabled_at, fork_parent_thread_id FROM projection_threads")
        .get() as { auto_settle_disabled_at: string; fork_parent_thread_id: string };
      assert.equal(thread.auto_settle_disabled_at, "2026-01-02T00:00:00.000Z");
      assert.equal(thread.fork_parent_thread_id, "parent");
    } finally {
      database.close();
    }

    const migrated = NodeFS.statSync(destination).mtimeMs;
    yield* importLegacyAviCode(destination);
    assert.equal(NodeFS.statSync(destination).mtimeMs, migrated);
  }).pipe(
    Effect.provideService(HostProcess.HomeDirectory, home),
    Effect.provide(NodeServices.layer),
  );
});

it.effect("never imports into a home other than the default one", () => {
  const { home, legacyDatabase } = makeHome();
  const elsewhere = NodePath.join(home, "dev", "userdata", "statev2.sqlite");
  return Effect.gen(function* () {
    yield* seedLegacyDatabase(legacyDatabase);
    yield* importLegacyAviCode(elsewhere);
    assert.isFalse(NodeFS.existsSync(elsewhere));
  }).pipe(
    Effect.provideService(HostProcess.HomeDirectory, home),
    Effect.provide(NodeServices.layer),
  );
});

it.effect("refuses a database whose shared migration history differs", () => {
  const { home, legacyDatabase, userdata } = makeHome();
  const destination = NodePath.join(userdata, "statev2.sqlite");
  return Effect.gen(function* () {
    yield* seedLegacyDatabase(legacyDatabase);
    const database = new NodeSqlite.DatabaseSync(legacyDatabase);
    database.exec("UPDATE effect_sql_migrations SET name = 'Something' WHERE migration_id = 33");
    database.close();
    const result = yield* Effect.exit(importLegacyAviCode(destination));
    assert.isTrue(result._tag === "Failure");
    assert.isFalse(NodeFS.existsSync(destination));
    assert.isFalse(NodeFS.existsSync(NodePath.join(userdata, LEGACY_IMPORT_MARKER_FILE)));
  }).pipe(
    Effect.provideService(HostProcess.HomeDirectory, home),
    Effect.provide(NodeServices.layer),
  );
});
