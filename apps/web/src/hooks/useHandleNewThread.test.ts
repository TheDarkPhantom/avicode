import { scopeProjectRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProjectId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { shouldCarryProviderSelectionBetweenProjects } from "./useHandleNewThread";

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
