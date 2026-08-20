import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  isCurrentPreviewRuntimeTab,
  parsePreviewRuntimeTabId,
  previewRuntimeTabId,
} from "./previewRuntimeTabId";

describe("previewRuntimeTabId", () => {
  it("scopes process-local tab ids to their environment, thread, and server epoch", () => {
    const base = {
      environmentId: EnvironmentId.make("environment-a"),
      threadId: ThreadId.make("thread-a"),
    };

    expect(previewRuntimeTabId(base, "epoch-a", "tab_1")).not.toBe(
      previewRuntimeTabId(
        { ...base, environmentId: EnvironmentId.make("environment-b") },
        "epoch-a",
        "tab_1",
      ),
    );
    expect(previewRuntimeTabId(base, "epoch-a", "tab_1")).not.toBe(
      previewRuntimeTabId({ ...base, threadId: ThreadId.make("thread-b") }, "epoch-a", "tab_1"),
    );
    expect(previewRuntimeTabId(base, "epoch-a", "tab_1")).not.toBe(
      previewRuntimeTabId(base, "epoch-b", "tab_1"),
    );
  });

  it("is stable for the same runtime tab", () => {
    const ref = {
      environmentId: EnvironmentId.make("environment-a"),
      threadId: ThreadId.make("thread-a"),
    };
    expect(previewRuntimeTabId(ref, null, "tab_1")).toBe(previewRuntimeTabId(ref, null, "tab_1"));
  });

  it("rejects a pinned operation target after the server epoch changes", () => {
    const ref = {
      environmentId: EnvironmentId.make("environment-a"),
      threadId: ThreadId.make("thread-a"),
    };
    const runtimeTabId = previewRuntimeTabId(ref, "epoch-a", "tab_1");

    expect(isCurrentPreviewRuntimeTab(ref, "epoch-a", "tab_1", runtimeTabId)).toBe(true);
    expect(isCurrentPreviewRuntimeTab(ref, "epoch-b", "tab_1", runtimeTabId)).toBe(false);
  });
});

describe("parsePreviewRuntimeTabId", () => {
  const ref = {
    environmentId: EnvironmentId.make("environment-a"),
    threadId: ThreadId.make("thread-a"),
  };

  it("round-trips a runtime tab id back to its thread", () => {
    const parsed = parsePreviewRuntimeTabId(previewRuntimeTabId(ref, "epoch-a", "tab_1"));
    expect(parsed?.threadRef.environmentId).toBe(ref.environmentId);
    expect(parsed?.threadRef.threadId).toBe(ref.threadId);
    expect(parsed?.serverEpoch).toBe("epoch-a");
    expect(parsed?.tabId).toBe("tab_1");
  });

  it("preserves a null server epoch", () => {
    expect(
      parsePreviewRuntimeTabId(previewRuntimeTabId(ref, null, "tab_1"))?.serverEpoch,
    ).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parsePreviewRuntimeTabId("not json")).toBeNull();
    expect(parsePreviewRuntimeTabId(JSON.stringify(["only", "three", "items"]))).toBeNull();
    expect(parsePreviewRuntimeTabId(JSON.stringify([1, 2, null, "tab"]))).toBeNull();
  });
});
