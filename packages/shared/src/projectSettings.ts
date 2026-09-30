/**
 * Avi Code addition. Per-project overrides of a few server settings.
 *
 * `aviCodeProjectSettingsOverrides` maps a project id to the settings that
 * project overrides. Anything acting for one project (git writing, thread
 * titles, new-thread defaults) reads `resolveProjectSettings(settings,
 * projectId)` instead of the global value. Inspired by upstream #11176.
 */
import {
  AVICODE_PROJECT_OVERRIDABLE_SETTING_KEYS,
  type AviCodeProjectOverridableSettingKey,
  type AviCodeProjectSettingsOverride,
  type ModelSelection,
  type ProjectId,
  type ServerSettings,
} from "@t3tools/contracts";
import { isModelSelectionProviderEnabled } from "./serverSettings.ts";

type OverridesHolder = Pick<ServerSettings, "aviCodeProjectSettingsOverrides">;

const EMPTY_OVERRIDE: AviCodeProjectSettingsOverride = {};

/** Cheap check so hot paths skip the project lookup when nothing is overridden. */
export function hasProjectSettingsOverrides(settings: OverridesHolder): boolean {
  for (const entry of Object.values(settings.aviCodeProjectSettingsOverrides ?? {})) {
    if (Object.keys(entry).length > 0) return true;
  }
  return false;
}

/** The project's stored overrides; `{}` for an unknown or missing project. */
export function getProjectSettingsOverride(
  settings: OverridesHolder,
  projectId: ProjectId | null | undefined,
): AviCodeProjectSettingsOverride {
  if (projectId === null || projectId === undefined) return EMPTY_OVERRIDE;
  return settings.aviCodeProjectSettingsOverrides?.[projectId] ?? EMPTY_OVERRIDE;
}

/**
 * Global settings with one project's overrides applied. A project value
 * replaces the global one outright (no merging inside a value). A text
 * generation model on a disabled provider is ignored so the project falls back
 * to the global model, the same guard the global selection gets.
 */
export function resolveProjectSettings<T extends ServerSettings>(
  settings: T,
  projectId: ProjectId | null | undefined,
): T {
  const override = getProjectSettingsOverride(settings, projectId);
  let resolved: T | undefined;
  for (const key of AVICODE_PROJECT_OVERRIDABLE_SETTING_KEYS) {
    if (!Object.hasOwn(override, key)) continue;
    const value = override[key];
    if (value === undefined) continue;
    if (
      key === "textGenerationModelSelection" &&
      !isModelSelectionProviderEnabled(settings, value as ModelSelection)
    ) {
      continue;
    }
    resolved ??= { ...settings };
    (resolved as Record<AviCodeProjectOverridableSettingKey, unknown>)[key] = value;
  }
  return resolved ?? settings;
}

const normalizeWorkspacePath = (value: string) => value.replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * The project a working directory belongs to: the project whose workspace
 * root it is, else the project of the thread whose worktree it is. Git
 * actions only carry a `cwd`, so this is how they find their project.
 */
export function findProjectIdForWorkspacePath(
  shell: {
    readonly projects: ReadonlyArray<{ readonly id: ProjectId; readonly workspaceRoot: string }>;
    readonly threads: ReadonlyArray<{
      readonly projectId: ProjectId;
      readonly worktreePath: string | null;
    }>;
  },
  cwd: string,
): ProjectId | null {
  const target = normalizeWorkspacePath(cwd);
  const project = shell.projects.find(
    (candidate) => normalizeWorkspacePath(candidate.workspaceRoot) === target,
  );
  if (project) return project.id;
  const thread = shell.threads.find(
    (candidate) =>
      candidate.worktreePath !== null && normalizeWorkspacePath(candidate.worktreePath) === target,
  );
  return thread?.projectId ?? null;
}

/**
 * The project's next override entry with `key` set to `value`, or with `key`
 * removed when `value` is `undefined` ("use default"). Returns `null` when the
 * entry ends up empty, which the settings patch reads as "remove the project".
 */
export function withProjectSettingOverride<K extends AviCodeProjectOverridableSettingKey>(
  current: AviCodeProjectSettingsOverride,
  key: K,
  value: AviCodeProjectSettingsOverride[K] | undefined,
): AviCodeProjectSettingsOverride | null {
  const next: Record<string, unknown> = { ...current };
  if (value === undefined) {
    delete next[key];
  } else {
    next[key] = value;
  }
  return Object.keys(next).length === 0 ? null : (next as AviCodeProjectSettingsOverride);
}
