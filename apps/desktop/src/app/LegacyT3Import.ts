// @effect-diagnostics nodeBuiltinImport:off - Import runs in the Electron main process.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import type { DesktopLegacyT3ImportResult, DesktopLegacyT3ImportStatus } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";

import * as DesktopBackendPool from "../backend/DesktopBackendPool.ts";
import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const IMPORT_MARKER = "legacy-t3-import.json";
const DATABASE_FILE = "state.sqlite";
const DATABASE_SIDECARS = ["state.sqlite-wal", "state.sqlite-shm"] as const;
const IMPORT_BACKUP_DIRECTORY = "t3-import-backups";
const IMPORT_STAGING_DIRECTORY = ".t3-import-staging";

interface ImportMarker {
  readonly schema: 1 | 2;
  readonly decision: "imported" | "fresh";
  readonly source: string;
  readonly importedAt?: string;
  readonly backupPath?: string;
}

export interface LegacyT3ImportPlan {
  readonly legacyStateDir: string;
  readonly legacyDatabase: string;
  readonly legacyAttachmentsDir: string;
  readonly targetStateDir: string;
  readonly targetDatabase: string;
  readonly targetAttachmentsDir: string;
  readonly markerPath: string;
  readonly backupRoot: string;
  readonly stagingRoot: string;
}

export function makeLegacyT3ImportPlan(input: {
  readonly homeDirectory: string;
  readonly targetStateDir: string;
}): LegacyT3ImportPlan {
  const legacyStateDir = NodePath.join(input.homeDirectory, ".t3", "userdata");
  return {
    legacyStateDir,
    legacyDatabase: NodePath.join(legacyStateDir, DATABASE_FILE),
    legacyAttachmentsDir: NodePath.join(legacyStateDir, "attachments"),
    targetStateDir: input.targetStateDir,
    targetDatabase: NodePath.join(input.targetStateDir, DATABASE_FILE),
    targetAttachmentsDir: NodePath.join(input.targetStateDir, "attachments"),
    markerPath: NodePath.join(input.targetStateDir, IMPORT_MARKER),
    backupRoot: NodePath.join(input.targetStateDir, IMPORT_BACKUP_DIRECTORY),
    stagingRoot: NodePath.join(input.targetStateDir, IMPORT_STAGING_DIRECTORY),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await NodeFSP.access(path);
    return true;
  } catch {
    return false;
  }
}

async function readImportMarker(markerPath: string): Promise<ImportMarker | null> {
  try {
    const parsed: unknown = JSON.parse(await NodeFSP.readFile(markerPath, "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("decision" in parsed) ||
      !("source" in parsed)
    ) {
      return null;
    }
    const decision = parsed.decision;
    const source = parsed.source;
    if ((decision !== "imported" && decision !== "fresh") || typeof source !== "string") {
      return null;
    }
    return {
      schema: "schema" in parsed && parsed.schema === 2 ? 2 : 1,
      decision,
      source,
      ...("importedAt" in parsed && typeof parsed.importedAt === "string"
        ? { importedAt: parsed.importedAt }
        : {}),
      ...("backupPath" in parsed && typeof parsed.backupPath === "string"
        ? { backupPath: parsed.backupPath }
        : {}),
    };
  } catch {
    return null;
  }
}

async function recordDecision(
  markerPath: string,
  marker: Omit<ImportMarker, "schema">,
): Promise<void> {
  await NodeFSP.mkdir(NodePath.dirname(markerPath), { recursive: true });
  await NodeFSP.writeFile(
    markerPath,
    `${JSON.stringify({ schema: 2, ...marker }, null, 2)}\n`,
    "utf8",
  );
}

function closeDatabase(database: NodeSqlite.DatabaseSync): void {
  try {
    database.close();
  } catch {
    // The original operation result is more useful than a secondary close error.
  }
}

export async function snapshotSqliteDatabase(sourcePath: string, destinationPath: string) {
  await NodeFSP.mkdir(NodePath.dirname(destinationPath), { recursive: true });
  const source = new NodeSqlite.DatabaseSync(sourcePath, { readOnly: true });
  try {
    await NodeSqlite.backup(source, destinationPath);
  } finally {
    closeDatabase(source);
  }

  const snapshot = new NodeSqlite.DatabaseSync(destinationPath, { readOnly: true });
  try {
    const integrity = snapshot.prepare("PRAGMA integrity_check").get() as
      | { readonly integrity_check?: unknown }
      | undefined;
    if (integrity?.integrity_check !== "ok") {
      throw new Error("The imported T3 Code database snapshot failed SQLite integrity checking.");
    }
  } finally {
    closeDatabase(snapshot);
  }
}

async function copyDirectoryContents(source: string, destination: string): Promise<void> {
  if (!(await exists(source))) return;
  await NodeFSP.mkdir(destination, { recursive: true });
  await NodeFSP.cp(source, destination, {
    recursive: true,
    force: true,
    errorOnExist: false,
  });
}

async function clearDatabaseFiles(stateDir: string): Promise<void> {
  await Promise.all(
    [DATABASE_FILE, ...DATABASE_SIDECARS].map((file) =>
      NodeFSP.rm(NodePath.join(stateDir, file), { force: true }),
    ),
  );
}

function backupDirectoryName(importedAt: string): string {
  return importedAt.replaceAll(":", "-");
}

export async function performRepeatImport(
  plan: LegacyT3ImportPlan,
  importedAt: string,
): Promise<{ readonly backupPath: string | null }> {
  await NodeFSP.rm(plan.stagingRoot, { recursive: true, force: true });
  await NodeFSP.mkdir(plan.stagingRoot, { recursive: true });
  const stagedDatabase = NodePath.join(plan.stagingRoot, DATABASE_FILE);
  await snapshotSqliteDatabase(plan.legacyDatabase, stagedDatabase);

  const backupPath = NodePath.join(plan.backupRoot, backupDirectoryName(importedAt));
  const targetExists = await exists(plan.targetDatabase);
  if (targetExists) {
    await NodeFSP.mkdir(backupPath, { recursive: true });
    await snapshotSqliteDatabase(plan.targetDatabase, NodePath.join(backupPath, DATABASE_FILE));
  }

  try {
    await clearDatabaseFiles(plan.targetStateDir);
    await NodeFSP.rename(stagedDatabase, plan.targetDatabase);
    await copyDirectoryContents(plan.legacyAttachmentsDir, plan.targetAttachmentsDir);
    await recordDecision(plan.markerPath, {
      decision: "imported",
      source: plan.legacyStateDir,
      importedAt,
      ...(targetExists ? { backupPath } : {}),
    });
    return { backupPath: targetExists ? backupPath : null };
  } catch (cause) {
    if (targetExists && (await exists(NodePath.join(backupPath, DATABASE_FILE)))) {
      await clearDatabaseFiles(plan.targetStateDir);
      await NodeFSP.copyFile(NodePath.join(backupPath, DATABASE_FILE), plan.targetDatabase);
    }
    throw cause;
  } finally {
    await NodeFSP.rm(plan.stagingRoot, { recursive: true, force: true });
  }
}

function importPlan(environment: DesktopEnvironment.DesktopEnvironment["Service"]) {
  return makeLegacyT3ImportPlan({
    homeDirectory: environment.homeDirectory,
    targetStateDir: environment.stateDir,
  });
}

export const getLegacyT3ImportStatus = Effect.fn("avicode.legacyT3Import.status")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const plan = importPlan(environment);
  const [available, marker] = yield* Effect.promise(() =>
    Promise.all([exists(plan.legacyDatabase), readImportMarker(plan.markerPath)]),
  );
  return {
    available,
    sourcePath: plan.legacyStateDir,
    lastImportedAt: marker?.decision === "imported" ? (marker.importedAt ?? null) : null,
  } satisfies DesktopLegacyT3ImportStatus;
});

export const importLatestT3Data = Effect.fn("avicode.legacyT3Import.latest")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  const dialog = yield* ElectronDialog.ElectronDialog;
  const pool = yield* DesktopBackendPool.DesktopBackendPool;
  const plan = importPlan(environment);

  if (!(yield* Effect.promise(() => exists(plan.legacyDatabase)))) {
    return {
      status: "unavailable",
      importedAt: null,
      backupPath: null,
      message: "No T3 Code workspace was found on this computer.",
    } satisfies DesktopLegacyT3ImportResult;
  }

  const choice = yield* dialog.showMessageBox({
    type: "warning",
    title: "Import the latest T3 Code workspace?",
    message: "Avi Code will refresh its projects and conversations from T3 Code.",
    detail:
      "The current Avi Code database is backed up first. Your Avi Code provider settings stay unchanged, but conversations created only in Avi Code are replaced by the T3 Code snapshot. Active agent turns in either app should finish before you continue.",
    buttons: ["Import and Restart", "Cancel"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice.response !== 0) {
    return {
      status: "cancelled",
      importedAt: null,
      backupPath: null,
      message: "Import cancelled.",
    } satisfies DesktopLegacyT3ImportResult;
  }

  const importedAt = DateTime.formatIso(yield* DateTime.now);
  const instances = yield* pool.list;
  yield* Effect.forEach(instances, (instance) => instance.stop(), {
    concurrency: "unbounded",
  });

  const result = yield* Effect.promise(() =>
    performRepeatImport(plan, importedAt).then(
      ({ backupPath }) =>
        ({
          status: "imported",
          importedAt,
          backupPath,
          message: "Latest T3 Code projects and conversations imported.",
        }) satisfies DesktopLegacyT3ImportResult,
      (cause: unknown) =>
        ({
          status: "failed",
          importedAt: null,
          backupPath: null,
          message: cause instanceof Error ? cause.message : String(cause),
        }) satisfies DesktopLegacyT3ImportResult,
    ),
  );

  yield* Effect.forEach(instances, (instance) => instance.start, {
    concurrency: "unbounded",
  });
  return result;
});

export const offerLegacyT3Import = Effect.fn("avicode.legacyT3Import.offer")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (environment.isDevelopment) return;

  const dialog = yield* ElectronDialog.ElectronDialog;
  const plan = importPlan(environment);
  const shouldOffer = yield* Effect.promise(
    async () =>
      (await exists(plan.legacyDatabase)) &&
      !(await exists(plan.targetDatabase)) &&
      !(await exists(plan.markerPath)),
  );
  if (!shouldOffer) return;

  const choice = yield* dialog.showMessageBox({
    type: "question",
    title: "Bring your T3 Code workspace into Avi Code?",
    message: "Avi Code found an existing T3 Code workspace.",
    detail:
      "Import copies your local projects and conversations into Avi Code. T3 Code is not changed or deleted.",
    buttons: ["Import", "Start Fresh", "Not Now"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (choice.response === 2) return;
  if (choice.response === 1) {
    const failure = yield* Effect.promise(() =>
      recordDecision(plan.markerPath, {
        decision: "fresh",
        source: plan.legacyStateDir,
      }).then(
        () => null,
        (cause: unknown) => String(cause),
      ),
    );
    if (failure) {
      yield* dialog.showErrorBox("Avi Code could not save your choice", failure);
    }
    return;
  }

  const importedAt = DateTime.formatIso(yield* DateTime.now);
  const failure = yield* Effect.promise(() =>
    performRepeatImport(plan, importedAt).then(
      () => null,
      (cause: unknown) => String(cause),
    ),
  );
  if (failure) {
    yield* dialog.showErrorBox(
      "Avi Code could not import T3 Code",
      `Your T3 Code data was not changed. Avi Code will offer the import again next launch.\n\n${failure}`,
    );
  }
});
