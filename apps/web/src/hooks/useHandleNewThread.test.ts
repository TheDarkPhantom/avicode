import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { DEFAULT_SERVER_SETTINGS, EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  resolveNewThreadWorkspaceDefaults,
  shouldCarryProviderSelectionBetweenProjects,
} from "./useHandleNewThread";

// Avi Code addition.
describe("resolveNewThreadWorkspaceDefaults", () => {
  const overridden = ProjectId.make("overridden");
  const settings = {
    ...DEFAULT_SERVER_SETTINGS,
    defaultThreadEnvMode: "local" as const,
    newWorktreesStartFromOrigin: true,
    aviCodeProjectSettingsOverrides: {
      [overridden]: {
        defaultThreadEnvMode: "worktree" as const,
        newWorktreesStartFromOrigin: false,
      },
    },
  };

  it("uses the project's env mode and start-from-origin overrides", () => {
    expect(resolveNewThreadWorkspaceDefaults(settings, overridden)).toEqual({
      defaultThreadEnvMode: "worktree",
      newWorktreesStartFromOrigin: false,
    });
  });

  it("uses the global defaults for a project without overrides", () => {
    expect(resolveNewThreadWorkspaceDefaults(settings, ProjectId.make("plain"))).toEqual({
      defaultThreadEnvMode: "local",
      newWorktreesStartFromOrigin: true,
    });
  });
});

const environmentId = EnvironmentId.make("local");
const clientL = scopeProjectRef(environmentId, ProjectId.make("client-l"));
const clientW = scopeProjectRef(environmentId, ProjectId.make("client-w"));

describe("shouldCarryProviderSelectionBetweenProjects", () => {
  it("keeps the existing global behavior when project isolation is disabled", () => {
    expect(
      shouldCarryProviderSelectionBetweenProjects({
        projectScopedProviderSelectionEnabled: false,
        sourceProjectRef: clientL,
        targetProjectRef: clientW,
      }),
    ).toBe(true);
  });

  it("carries provider credentials only within the same project when isolation is enabled", () => {
    expect(
      shouldCarryProviderSelectionBetweenProjects({
        projectScopedProviderSelectionEnabled: true,
        sourceProjectRef: clientL,
        targetProjectRef: clientL,
      }),
    ).toBe(true);
    expect(
      shouldCarryProviderSelectionBetweenProjects({
        projectScopedProviderSelectionEnabled: true,
        sourceProjectRef: clientL,
        targetProjectRef: clientW,
      }),
    ).toBe(false);
    expect(
      shouldCarryProviderSelectionBetweenProjects({
        projectScopedProviderSelectionEnabled: true,
        sourceProjectRef: null,
        targetProjectRef: clientW,
      }),
    ).toBe(false);
  });
});
