import {
  DEFAULT_SERVER_SETTINGS,
  ProjectId,
  ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import {
  findProjectIdForWorkspacePath,
  getProjectSettingsOverride,
  hasProjectSettingsOverrides,
  resolveProjectSettings,
  withProjectSettingOverride,
} from "./projectSettings.ts";
import { applyServerSettingsPatch } from "./serverSettings.ts";

const projectA = ProjectId.make("project-a");
const projectB = ProjectId.make("project-b");
const codexModel = { instanceId: ProviderInstanceId.make("codex"), model: "gpt-project" };

function settingsWith(
  overrides: ServerSettings["aviCodeProjectSettingsOverrides"],
  base: Partial<ServerSettings> = {},
): ServerSettings {
  return { ...DEFAULT_SERVER_SETTINGS, ...base, aviCodeProjectSettingsOverrides: overrides };
}

describe("resolveProjectSettings", () => {
  it("returns the global settings untouched for unknown or missing projects", () => {
    const settings = settingsWith({ [projectA]: { defaultThreadEnvMode: "worktree" } });
    expect(resolveProjectSettings(settings, projectB)).toBe(settings);
    expect(resolveProjectSettings(settings, null)).toBe(settings);
    expect(resolveProjectSettings(settings, undefined)).toBe(settings);
  });

  it("lets a project value win over the global value and leaves other keys global", () => {
    const settings = settingsWith(
      {
        [projectA]: {
          defaultThreadEnvMode: "worktree",
          newWorktreesStartFromOrigin: false,
          textGenerationModelSelection: codexModel,
        },
      },
      { defaultThreadEnvMode: "local", newWorktreesStartFromOrigin: true },
    );
    const resolved = resolveProjectSettings(settings, projectA);
    expect(resolved.defaultThreadEnvMode).toBe("worktree");
    expect(resolved.newWorktreesStartFromOrigin).toBe(false);
    expect(resolved.textGenerationModelSelection).toEqual(codexModel);
    expect(resolved.sourceControlWritingStyle).toBe(settings.sourceControlWritingStyle);
    // The global settings object is never mutated.
    expect(settings.defaultThreadEnvMode).toBe("local");
  });

  it("replaces a structured value whole instead of merging it", () => {
    const settings = settingsWith(
      {
        [projectA]: {
          sourceControlWritingStyle: {
            mode: "custom",
            customInstructions: "Project voice.",
            followChangeRequestTemplates: false,
          },
        },
      },
      {
        sourceControlWritingStyle: {
          mode: "conventional_commits",
          customInstructions: "Global voice.",
          followChangeRequestTemplates: true,
        },
      },
    );
    expect(resolveProjectSettings(settings, projectA).sourceControlWritingStyle).toEqual({
      mode: "custom",
      customInstructions: "Project voice.",
      followChangeRequestTemplates: false,
    });
  });

  it("treats a null writer model as a real override, not as inherit", () => {
    const settings = settingsWith(
      { [projectA]: { sourceControlWriterModelSelection: null } },
      { sourceControlWriterModelSelection: codexModel },
    );
    expect(resolveProjectSettings(settings, projectA).sourceControlWriterModelSelection).toBeNull();
    expect(resolveProjectSettings(settings, projectB).sourceControlWriterModelSelection).toEqual(
      codexModel,
    );
  });

  it("falls back to the global text generation model when the project's provider is disabled", () => {
    const disabled = { instanceId: ProviderInstanceId.make("missing"), model: "nope" };
    const settings = settingsWith({ [projectA]: { textGenerationModelSelection: disabled } });
    expect(resolveProjectSettings(settings, projectA).textGenerationModelSelection).toEqual(
      DEFAULT_SERVER_SETTINGS.textGenerationModelSelection,
    );
  });
});

describe("project override helpers", () => {
  it("reports whether any project has overrides", () => {
    expect(hasProjectSettingsOverrides(settingsWith({}))).toBe(false);
    expect(hasProjectSettingsOverrides(settingsWith({ [projectA]: {} }))).toBe(false);
    expect(
      hasProjectSettingsOverrides(settingsWith({ [projectA]: { defaultThreadEnvMode: "local" } })),
    ).toBe(true);
  });

  it("sets and clears single overrides, returning null once the entry is empty", () => {
    const withMode = withProjectSettingOverride({}, "defaultThreadEnvMode", "worktree");
    expect(withMode).toEqual({ defaultThreadEnvMode: "worktree" });
    const withWriter = withProjectSettingOverride(
      withMode ?? {},
      "sourceControlWriterModelSelection",
      null,
    );
    expect(withWriter).toEqual({
      defaultThreadEnvMode: "worktree",
      sourceControlWriterModelSelection: null,
    });
    expect(
      withProjectSettingOverride(withWriter ?? {}, "sourceControlWriterModelSelection", undefined),
    ).toEqual({ defaultThreadEnvMode: "worktree" });
    expect(
      withProjectSettingOverride(withMode ?? {}, "defaultThreadEnvMode", undefined),
    ).toBeNull();
  });

  it("finds a project by workspace root or by one of its thread worktrees", () => {
    const shell = {
      projects: [{ id: projectA, workspaceRoot: "C:\\repos\\app" }],
      threads: [{ projectId: projectB, worktreePath: "/home/me/.t3/worktrees/b/feature" }],
    };
    expect(findProjectIdForWorkspacePath(shell, "C:/repos/app/")).toBe(projectA);
    expect(findProjectIdForWorkspacePath(shell, "/home/me/.t3/worktrees/b/feature")).toBe(projectB);
    expect(findProjectIdForWorkspacePath(shell, "/elsewhere")).toBeNull();
  });
});

describe("applyServerSettingsPatch project overrides", () => {
  it("replaces a patched project's entry, removes null entries and keeps the rest", () => {
    const current = settingsWith({
      [projectA]: { defaultThreadEnvMode: "worktree", newWorktreesStartFromOrigin: false },
      [projectB]: { textGenerationModelSelection: codexModel },
    });
    const next = applyServerSettingsPatch(current, {
      aviCodeProjectSettingsOverrides: { [projectA]: { defaultThreadEnvMode: "local" } },
    });
    // Entry replacement: the dropped key is gone rather than merged back.
    expect(getProjectSettingsOverride(next, projectA)).toEqual({ defaultThreadEnvMode: "local" });
    expect(getProjectSettingsOverride(next, projectB)).toEqual({
      textGenerationModelSelection: codexModel,
    });

    const cleared = applyServerSettingsPatch(next, {
      aviCodeProjectSettingsOverrides: { [projectA]: null, [projectB]: {} },
    });
    expect(cleared.aviCodeProjectSettingsOverrides).toEqual({});
  });

  it("leaves overrides alone when the patch does not mention them", () => {
    const current = settingsWith({ [projectA]: { defaultThreadEnvMode: "worktree" } });
    const next = applyServerSettingsPatch(current, { defaultThreadEnvMode: "worktree" });
    expect(next.aviCodeProjectSettingsOverrides).toEqual(current.aviCodeProjectSettingsOverrides);
  });
});
