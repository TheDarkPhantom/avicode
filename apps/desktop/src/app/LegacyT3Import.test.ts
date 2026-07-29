// @effect-diagnostics nodeBuiltinImport:off - Tests exercise the desktop filesystem boundary.
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import { describe, expect, it } from "vite-plus/test";
import {
  makeLegacyT3ImportPlan,
  performRepeatImport,
  snapshotSqliteDatabase,
} from "./LegacyT3Import.ts";

function createMessageDatabase(path: string, body: string): void {
  const database = new NodeSqlite.DatabaseSync(path);
  try {
    database.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
    database.prepare("INSERT INTO messages (body) VALUES (?)").run(body);
  } finally {
    database.close();
  }
}

function readMessage(path: string): unknown {
  const database = new NodeSqlite.DatabaseSync(path, { readOnly: true });
  try {
    return database.prepare("SELECT body FROM messages").get();
  } finally {
    database.close();
  }
}

describe("LegacyT3Import", () => {
  it("keeps the legacy source and AviCode destination separate", () => {
    const homeDirectory = NodePath.join(NodePath.parse(process.cwd()).root, "Users", "Avi");
    const targetStateDir = NodePath.join(homeDirectory, ".avicode", "userdata");
    const plan = makeLegacyT3ImportPlan({
      homeDirectory,
      targetStateDir,
    });
    expect(plan.legacyDatabase).toContain(".t3");
    expect(plan.targetDatabase).toContain(".avicode");
    expect(plan.legacyDatabase).not.toBe(plan.targetDatabase);
    expect(plan.legacyAttachmentsDir).toBe(
      NodePath.join(homeDirectory, ".t3", "userdata", "attachments"),
    );
    expect(plan.targetAttachmentsDir).toBe(NodePath.join(targetStateDir, "attachments"));
  });

  it("creates a validated standalone SQLite snapshot", async () => {
    const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "avicode-t3-import-"));
    const sourcePath = NodePath.join(directory, "source.sqlite");
    const snapshotPath = NodePath.join(directory, "snapshot.sqlite");
    const source = new NodeSqlite.DatabaseSync(sourcePath);
    try {
      source.exec("CREATE TABLE messages (id INTEGER PRIMARY KEY, body TEXT NOT NULL)");
      source.prepare("INSERT INTO messages (body) VALUES (?)").run("continued in T3 Code");

      await snapshotSqliteDatabase(sourcePath, snapshotPath);

      const snapshot = new NodeSqlite.DatabaseSync(snapshotPath, { readOnly: true });
      try {
        expect(snapshot.prepare("SELECT body FROM messages").get()).toEqual({
          body: "continued in T3 Code",
        });
      } finally {
        snapshot.close();
      }
    } finally {
      source.close();
      await NodeFSP.rm(directory, { recursive: true, force: true });
    }
  });

  it("backs up Avi Code before replacing it with the latest T3 snapshot", async () => {
    const homeDirectory = await NodeFSP.mkdtemp(
      NodePath.join(NodeOS.tmpdir(), "avicode-repeat-import-"),
    );
    const targetStateDir = NodePath.join(homeDirectory, ".avicode", "userdata");
    const plan = makeLegacyT3ImportPlan({ homeDirectory, targetStateDir });
    const importedAt = "2026-07-29T04:30:00.000Z";

    try {
      await NodeFSP.mkdir(plan.legacyStateDir, { recursive: true });
      await NodeFSP.mkdir(plan.targetStateDir, { recursive: true });
      await NodeFSP.mkdir(plan.legacyAttachmentsDir, { recursive: true });
      createMessageDatabase(plan.legacyDatabase, "continued in T3 Code");
      createMessageDatabase(plan.targetDatabase, "Avi Code before refresh");
      await NodeFSP.writeFile(
        NodePath.join(plan.legacyAttachmentsDir, "document.txt"),
        "attachment",
      );

      const result = await performRepeatImport(plan, importedAt);

      expect(readMessage(plan.targetDatabase)).toEqual({ body: "continued in T3 Code" });
      expect(result.backupPath).not.toBeNull();
      expect(readMessage(NodePath.join(result.backupPath!, "state.sqlite"))).toEqual({
        body: "Avi Code before refresh",
      });
      expect(
        await NodeFSP.readFile(NodePath.join(plan.targetAttachmentsDir, "document.txt"), "utf8"),
      ).toBe("attachment");
    } finally {
      await NodeFSP.rm(homeDirectory, { recursive: true, force: true });
    }
  });
});
