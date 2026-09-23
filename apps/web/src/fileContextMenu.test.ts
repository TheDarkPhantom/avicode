import { describe, expect, it } from "vite-plus/test";
import type { EditorId } from "@t3tools/contracts";

import { buildFileContextMenuItems, resolveFileContextMenuAbsolutePath } from "./fileContextMenu";

describe("resolveFileContextMenuAbsolutePath", () => {
  it("returns null for an empty path", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        environmentId: null,
        filePath: "",
        workspaceRoot: undefined,
      }),
    ).toBeNull();
  });

  it("passes an absolute path through when there is no workspace root", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        environmentId: null,
        filePath: "/repo/src/index.ts",
        workspaceRoot: undefined,
      }),
    ).toBe("/repo/src/index.ts");
  });

  it("refuses a relative path without a workspace root", () => {
    expect(
      resolveFileContextMenuAbsolutePath({
        environmentId: null,
        filePath: "src/index.ts",
        workspaceRoot: undefined,
      }),
    ).toBeNull();
  });
});

describe("buildFileContextMenuItems", () => {
  it("is empty without a resolvable absolute path", () => {
    expect(
      buildFileContextMenuItems({
        hasAbsolutePath: false,
        capabilities: { revealLabel: "Reveal in File Explorer", editorIds: ["vscode"] },
      }),
    ).toEqual([]);
  });

  it("offers reveal plus an Open with submenu, excluding the file manager", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      capabilities: {
        revealLabel: "Reveal in File Explorer",
        editorIds: ["file-manager", "vscode", "cursor"] as ReadonlyArray<EditorId>,
      },
    });

    expect(items.map((item) => item.id)).toEqual(["reveal-in-folder", "open-with"]);
    const openWith = items.find((item) => item.id === "open-with");
    expect(openWith?.children?.map((child) => child.id)).toEqual([
      "editor:vscode",
      "editor:cursor",
    ]);
  });

  it("omits reveal when the file manager is unavailable", () => {
    const items = buildFileContextMenuItems({
      hasAbsolutePath: true,
      capabilities: { revealLabel: undefined, editorIds: ["vscode"] },
    });
    expect(items.map((item) => item.id)).toEqual(["open-with"]);
  });
});
