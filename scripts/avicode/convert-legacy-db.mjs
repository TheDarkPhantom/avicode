// Converts a COPY of an Avi Code (fork V1) state.sqlite so upstream t3code's migrator can take it.
// Usage: node scripts/avicode/convert-legacy-db.mjs <path-to-copy.sqlite>
// Refuses the live ~/.avicode/userdata database; take a VACUUM INTO snapshot first.
import * as NodeSqlite from "node:sqlite";
const path = process.argv[2];
if (!path || /\.avicode[\\/]userdata/.test(path)) throw new Error("refusing: pass a scratch copy");
const db = new NodeSqlite.DatabaseSync(path);
const q = (s) => db.prepare(s).all();
console.log(
  "ledger:",
  q("SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id")
    .map((r) => `${r.migration_id}_${r.name}`)
    .join(" "),
);
const cols = (t) => q(`PRAGMA table_info(${t})`).map((c) => c.name);
const reAdded = [
  "title_regeneration_request_id",
  "title_regeneration_started_at",
  "auto_settle_disabled_at",
];
db.exec("BEGIN");
db.exec("DROP TABLE IF EXISTS avicode_preserve_threads");
db.exec(
  `CREATE TABLE avicode_preserve_threads AS SELECT thread_id, ${reAdded.join(", ")} FROM projection_threads`,
);
for (const idx of q(
  "SELECT name, sql FROM sqlite_master WHERE type='index' AND tbl_name='projection_threads' AND sql IS NOT NULL",
)) {
  if (reAdded.some((c) => idx.sql.includes(c))) {
    console.log("drop index", idx.name);
    db.exec(`DROP INDEX ${idx.name}`);
  }
}
for (const c of reAdded)
  if (cols("projection_threads").includes(c))
    db.exec(`ALTER TABLE projection_threads DROP COLUMN ${c}`);
const del = db.prepare("DELETE FROM effect_sql_migrations WHERE migration_id > 34").run();
console.log("removed ledger rows:", del.changes);
db.exec("COMMIT");
console.log(
  "threads:",
  q("SELECT count(*) n FROM projection_threads")[0].n,
  "messages:",
  q("SELECT count(*) n FROM projection_thread_messages")[0].n,
);
db.close();
