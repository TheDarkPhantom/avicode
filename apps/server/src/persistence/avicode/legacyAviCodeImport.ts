// @effect-diagnostics nodeBuiltinImport:off
import * as NodeWorkerThreads from "node:worker_threads";

import { AVICODE_IDENTITY } from "@t3tools/shared/avicodeIdentity";
import { DATABASE_MIGRATIONS_STARTED_MESSAGE } from "@t3tools/shared/databaseMigrationLog";
import * as HostProcess from "@t3tools/shared/HostProcess";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { migrationManifest } from "../Migrations.ts";

export class LegacyAviCodeImportError extends Schema.TaggedError<LegacyAviCodeImportError>()(
  "LegacyAviCodeImportError",
  { sourcePath: Schema.String, cause: Schema.Defect() },
) {
  override get message() {
    return `Could not import the first Avi Code's history from ${this.sourcePath}. Avi Code 2 starts empty; the original data is unchanged.`;
  }
}

export const LEGACY_IMPORT_MARKER_FILE = "avicode-legacy-import.json";

const LegacyImportMarker = Schema.Struct({
  importedAt: Schema.String,
  sourcePath: Schema.String,
  threads: Schema.Number,
});
const encodeMarker = Schema.encodeEffect(Schema.fromJsonString(LegacyImportMarker));

/** Migration ids the first Avi Code shares with upstream by name; its later ids are its own. */
export const LEGACY_SHARED_MIGRATION_COUNT = 34;

const COPIED_ENTRIES = [
  "settings.json",
  "client-settings.json",
  "keybindings.json",
  "secrets",
  "attachments",
] as const;

// The source stays read-only. After the copy, migration records past the shared ids are dropped so
// upstream's migrator, which skips every id at or below the highest recorded, runs its own 35+.
// Their columns stay: upstream's migrations check for existing columns before adding them.
const snapshotWorkerSource = `
const { workerData } = require("node:worker_threads");
const { DatabaseSync } = require("node:sqlite");
const source = new DatabaseSync(workerData.sourcePath, { readOnly: true });
try {
  source.exec("PRAGMA auto_vacuum = INCREMENTAL");
  source.prepare("VACUUM INTO ?").run(workerData.snapshotPath);
} finally {
  source.close();
}
const snapshot = new DatabaseSync(workerData.snapshotPath);
try {
  const recorded = snapshot
    .prepare("SELECT migration_id AS id, name FROM effect_sql_migrations WHERE migration_id <= ?")
    .all(workerData.sharedCount);
  const expected = new Map(workerData.sharedNames);
  const mismatch = recorded.find((row) => expected.get(row.id) !== row.name);
  if (recorded.length !== workerData.sharedCount || mismatch) {
    throw new Error("Unexpected migration history in the first Avi Code's database.");
  }
  snapshot.prepare("DELETE FROM effect_sql_migrations WHERE migration_id > ?").run(workerData.sharedCount);
  const threads = snapshot.prepare("SELECT count(*) AS n FROM projection_threads").get().n;
  require("node:worker_threads").parentPort.postMessage(Number(threads));
} finally {
  snapshot.close();
}
`;

const importDatabase = Effect.fn("LegacyAviCodeImport.importDatabase")(function* (input: {
  readonly sourcePath: string;
  readonly destinationPath: string;
}) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const directory = path.dirname(input.destinationPath);
  const temporaryDirectory = yield* fs.makeTempDirectoryScoped({
    directory,
    prefix: `.avicode-import-${process.pid}-`,
  });
  const snapshotPath = path.join(temporaryDirectory, "snapshot.sqlite");
  const sharedNames = migrationManifest.filter(([id]) => id <= LEGACY_SHARED_MIGRATION_COUNT);
  let threads = 0;
  yield* Effect.callback<void, LegacyAviCodeImportError>((resume) => {
    const fail = (cause: unknown) =>
      resume(Effect.fail(new LegacyAviCodeImportError({ sourcePath: input.sourcePath, cause })));
    const worker = new NodeWorkerThreads.Worker(snapshotWorkerSource, {
      eval: true,
      workerData: {
        sourcePath: input.sourcePath,
        snapshotPath,
        sharedCount: LEGACY_SHARED_MIGRATION_COUNT,
        sharedNames,
      },
    });
    worker.on("message", (count: number) => {
      threads = count;
    });
    worker.once("error", fail);
    worker.once("exit", (code) =>
      code === 0 ? resume(Effect.void) : fail(new Error(`Import worker exited with ${code}`)),
    );
    return Effect.promise(() => worker.terminate());
  });
  yield* fs.link(snapshotPath, input.destinationPath);
  return threads;
}, Effect.scoped);

/**
 * On Avi Code 2's first start, carries the first Avi Code's history over once: a converted
 * snapshot becomes the V2 database, which upstream then migrates and imports thread by thread.
 * Only runs for the default data home, never for dev or explicit `--base-dir` homes.
 */
export const importLegacyAviCode = Effect.fn("LegacyAviCodeImport.importLegacyAviCode")(function* (
  destinationPath: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const home = yield* HostProcess.HomeDirectory;
  const directory = path.dirname(destinationPath);
  const defaultDirectory = path.join(home, AVICODE_IDENTITY.homeDirectoryName, "userdata");
  if (path.resolve(directory) !== path.resolve(defaultDirectory)) return;

  const legacyDirectory = path.join(home, AVICODE_IDENTITY.legacy.homeDirectoryName, "userdata");
  const sourcePath = path.join(legacyDirectory, "state.sqlite");
  const markerPath = path.join(directory, LEGACY_IMPORT_MARKER_FILE);
  if (yield* fs.exists(markerPath)) return;
  if (yield* fs.exists(destinationPath)) return;
  if (yield* fs.exists(path.join(directory, "state.sqlite"))) return;
  if (!(yield* fs.exists(sourcePath))) return;

  // The desktop extends its startup wait while the last migration line is a "started" one.
  yield* Effect.log(DATABASE_MIGRATIONS_STARTED_MESSAGE);
  yield* Effect.log("Importing history from the first Avi Code. This can take a few minutes.");
  yield* fs.makeDirectory(directory, { recursive: true });
  const threads = yield* importDatabase({ sourcePath, destinationPath });
  for (const entry of COPIED_ENTRIES) {
    const from = path.join(legacyDirectory, entry);
    const to = path.join(directory, entry);
    if (!(yield* fs.exists(from)) || (yield* fs.exists(to))) continue;
    yield* fs.copy(from, to).pipe(Effect.ignore({ log: true }));
  }
  const importedAt = DateTime.formatIso(yield* DateTime.now);
  const marker = yield* encodeMarker({ importedAt, sourcePath, threads }).pipe(Effect.orDie);
  yield* fs.writeFileString(markerPath, `${marker}\n`);
  yield* Effect.log(`Imported ${String(threads)} threads from the first Avi Code.`);
});
