import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadRightPanelState, useRightPanelStore } from "./rightPanelStore";

const THREAD_REF = scopeThreadRef(
  EnvironmentId.make("environment-local"),
  ThreadId.make("thread-1"),
);

function surfaces() {
  return selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF)
    .surfaces;
}

/**
 * Avi Code addition: file surfaces can be anchored to a repo other than the
 * thread's own, so the root has to take part in surface identity.
 */
describe("right panel file surfaces with an external root", () => {
  beforeEach(() => {
    useRightPanelStore.setState({ byThreadKey: {} });
  });

  it("keeps the plain surface id when there is no root, so persisted tabs still load", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/README.md");
    expect(surfaces()).toMatchObject([
      { id: "file:docs/README.md", relativePath: "docs/README.md" },
    ]);
  });

  it("opens the same relative path in two repos as two tabs", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/README.md");
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/README.md", undefined, "/repo/other");

    const open = surfaces();
    expect(open).toHaveLength(2);
    expect(open[0]).toMatchObject({ relativePath: "docs/README.md" });
    // The thread-relative surface carries no root at all, which is what keeps
    // tabs persisted before cross-repo opening loadable.
    expect(open[0]).not.toHaveProperty("root");
    expect(open[1]).toMatchObject({ relativePath: "docs/README.md", root: "/repo/other" });
    expect(open[0]?.id).not.toBe(open[1]?.id);
  });

  it("reuses the tab and bumps the reveal when the same rooted file reopens", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/README.md", 4, "/repo/other");
    const first = surfaces();
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/README.md", 9, "/repo/other");
    const second = surfaces();

    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({ revealLine: 9, root: "/repo/other" });
    expect(second[0]).not.toEqual(first[0]);
  });

  it("moves a tab onto the repo that owns it, in place", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "dev/other/docs/x.md", 12);
    const stale = surfaces()[0];

    useRightPanelStore
      .getState()
      .rerootFile(THREAD_REF, stale?.id ?? "", "/repo/other", "docs/x.md");

    const open = surfaces();
    // One tab, not a dead one beside a working one.
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ relativePath: "docs/x.md", root: "/repo/other" });
    expect(
      selectThreadRightPanelState(useRightPanelStore.getState().byThreadKey, THREAD_REF)
        .activeSurfaceId,
    ).toBe(open[0]?.id);
  });

  it("keeps the reveal line when a tab is rerooted", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "dev/other/docs/x.md", 12);
    const stale = surfaces()[0];

    useRightPanelStore
      .getState()
      .rerootFile(THREAD_REF, stale?.id ?? "", "/repo/other", "docs/x.md");

    // The reveal survives, and its request id is bumped so the panel jumps to
    // the line again once the path that finally loaded renders.
    expect(surfaces()[0]).toMatchObject({ revealLine: 12, revealRequestId: 2 });
  });

  it("drops the unreadable tab when the same file is already open in that repo", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/x.md", undefined, "/repo/other");
    useRightPanelStore.getState().openFile(THREAD_REF, "dev/other/docs/x.md");
    const stale = surfaces()[1];

    useRightPanelStore
      .getState()
      .rerootFile(THREAD_REF, stale?.id ?? "", "/repo/other", "docs/x.md");

    const open = surfaces();
    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({ relativePath: "docs/x.md", root: "/repo/other" });
  });

  it("ignores a reroot for a surface that is gone", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/x.md");
    const before = surfaces();

    useRightPanelStore.getState().rerootFile(THREAD_REF, "file:missing", "/repo/other", "x.md");

    expect(surfaces()).toEqual(before);
  });

  it("keeps a rooted file open when the thread loses its own workspace", () => {
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/local.md");
    useRightPanelStore.getState().openFile(THREAD_REF, "docs/other.md", undefined, "/repo/other");

    useRightPanelStore.getState().reconcileFileSurfaces(THREAD_REF, false);

    // The thread-relative file cannot be read without a workspace; the one
    // carrying its own root does not depend on it.
    expect(surfaces()).toMatchObject([{ relativePath: "docs/other.md", root: "/repo/other" }]);
  });
});
