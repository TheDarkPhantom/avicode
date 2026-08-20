import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";

import { resolveBackgroundTabTarget } from "./useOpenBackgroundTabRequests";

const envA = "env-a" as EnvironmentId;
const envB = "env-b" as EnvironmentId;
const refA = scopeThreadRef(envA, ThreadId.make("thread-a"));

describe("resolveBackgroundTabTarget", () => {
  it("resolves the source tab's thread when it is in the active environment", () => {
    const sourceTabId = previewRuntimeTabId(refA, "epoch-a", "tab_1");
    const target = resolveBackgroundTabTarget(sourceTabId, envA);
    expect(target?.environmentId).toBe(envA);
    expect(target?.threadId).toBe(refA.threadId);
  });

  it("ignores a source tab from a different environment", () => {
    const sourceTabId = previewRuntimeTabId(refA, "epoch-a", "tab_1");
    expect(resolveBackgroundTabTarget(sourceTabId, envB)).toBeNull();
  });

  it("ignores a malformed source tab id", () => {
    expect(resolveBackgroundTabTarget("garbage", envA)).toBeNull();
  });
});
