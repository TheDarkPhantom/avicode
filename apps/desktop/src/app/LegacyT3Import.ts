// @effect-diagnostics nodeBuiltinImport:off - Copy-only migration runs before the backend opens SQLite.
import * as NodeFS from "node:fs/promises";
import * as NodePath from "node:path";

import * as Effect from "effect/Effect";

import * as ElectronDialog from "../electron/ElectronDialog.ts";
import * as DesktopEnvironment from "./DesktopEnvironment.ts";

const IMPORT_MARKER = "legacy-t3-import.json";
const DATABASE_FILES = ["state.sqlite", "state.sqlite-wal", "state.sqlite-shm"] as const;

export interface LegacyT3ImportPlan {
  readonly legacyDatabase: string;
  readonly targetDatabase: string;
  readonly markerPath: string;
}

export function makeLegacyT3ImportPlan(input: {
  readonly homeDirectory: string;
  readonly targetStateDir: string;
}): LegacyT3ImportPlan {
  return {
    legacyDatabase: NodePath.join(input.homeDirectory, ".t3", "userdata", "state.sqlite"),
    targetDatabase: NodePath.join(input.targetStateDir, "state.sqlite"),
    markerPath: NodePath.join(input.targetStateDir, IMPORT_MARKER),
  };
}

async function exists(path: string): Promise<boolean> {
  try {
    await NodeFS.access(path);
    return true;
  } catch {
    return false;
  }
}

async function recordDecision(
  markerPath: string,
  decision: "imported" | "fresh",
  source: string,
): Promise<void> {
  await NodeFS.mkdir(NodePath.dirname(markerPath), { recursive: true });
  await NodeFS.writeFile(
    markerPath,
    `${JSON.stringify({ schema: 1, decision, source }, null, 2)}\n`,
    "utf8",
  );
}

export const offerLegacyT3Import = Effect.fn("avicode.legacyT3Import.offer")(function* () {
  const environment = yield* DesktopEnvironment.DesktopEnvironment;
  if (environment.isDevelopment) return;

  const dialog = yield* ElectronDialog.ElectronDialog;
  const plan = makeLegacyT3ImportPlan({
    homeDirectory: environment.homeDirectory,
    targetStateDir: environment.stateDir,
  });
  const shouldOffer = yield* Effect.promise(
    async () =>
      (await exists(plan.legacyDatabase)) &&
      !(await exists(plan.targetDatabase)) &&
      !(await exists(plan.markerPath)),
  );
  if (!shouldOffer) return;

  const choice = yield* dialog.showMessageBox({
    type: "question",
    title: "Bring your T3 Code workspace into AviCode?",
    message: "AviCode found an existing T3 Code workspace.",
    detail:
      "Import copies your local projects, threads, and settings into AviCode. T3 Code is not changed or deleted. Close T3 Code before importing for the safest database snapshot.",
    buttons: ["Import", "Start Fresh", "Not Now"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (choice.response === 2) return;
  if (choice.response === 1) {
    const failure = yield* Effect.promise(() =>
      recordDecision(plan.markerPath, "fresh", NodePath.dirname(plan.legacyDatabase)).then(
        () => null,
        (cause: unknown) => String(cause),
      ),
    );
    if (failure) {
      yield* dialog.showErrorBox("AviCode could not save your choice", failure);
    }
    return;
  }

  const failure = yield* Effect.promise(async () => {
    try {
      await NodeFS.mkdir(environment.stateDir, { recursive: true });
      const sourceDir = NodePath.dirname(plan.legacyDatabase);
      for (const file of DATABASE_FILES) {
        const source = NodePath.join(sourceDir, file);
        if (await exists(source)) {
          await NodeFS.copyFile(source, NodePath.join(environment.stateDir, file));
        }
      }
      await recordDecision(plan.markerPath, "imported", sourceDir);
      return null;
    } catch (cause) {
      return String(cause);
    }
  });
  if (failure) {
    yield* dialog.showErrorBox(
      "AviCode could not import T3 Code",
      `Your T3 Code data was not changed. AviCode will offer the import again next launch.\n\n${failure}`,
    );
  }
});
