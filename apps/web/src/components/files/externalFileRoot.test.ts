import { describe, expect, it } from "vite-plus/test";

import { resolveFileSurfaceRoot } from "./externalFileRoot";

describe("resolveFileSurfaceRoot", () => {
  it("matches a registered project so the tree shows a repo the user knows", () => {
    expect(
      resolveFileSurfaceRoot("C:/Users/avi/dev/advisoravi-business/docs/notes.md", [
        "C:/Users/avi/dev/avicode",
        "C:/Users/avi/dev/advisoravi-business",
      ]),
    ).toEqual({
      root: "C:/Users/avi/dev/advisoravi-business",
      relativePath: "docs/notes.md",
    });
  });

  it("prefers the deepest project when one is nested inside another", () => {
    expect(
      resolveFileSurfaceRoot("/repo/packages/inner/src/index.ts", [
        "/repo",
        "/repo/packages/inner",
      ]),
    ).toEqual({ root: "/repo/packages/inner", relativePath: "src/index.ts" });
  });

  it("ignores project order when picking the deepest match", () => {
    expect(
      resolveFileSurfaceRoot("/repo/packages/inner/src/index.ts", [
        "/repo/packages/inner",
        "/repo",
      ]),
    ).toEqual({ root: "/repo/packages/inner", relativePath: "src/index.ts" });
  });

  it("matches a Windows path regardless of separator or case", () => {
    expect(
      resolveFileSurfaceRoot("c:\\Users\\avi\\dev\\Repo\\docs\\notes.md", [
        "C:/Users/avi/dev/repo",
      ]),
    ).toEqual({ root: "C:/Users/avi/dev/repo", relativePath: "docs/notes.md" });
  });

  it("falls back to the file's own folder when no project owns it", () => {
    expect(resolveFileSurfaceRoot("/scratch/notes/todo.md", ["/repo"])).toEqual({
      root: "/scratch/notes",
      relativePath: "todo.md",
    });
  });

  it("falls back for a Windows path with no matching project", () => {
    expect(resolveFileSurfaceRoot("D:\\scratch\\notes\\todo.md", ["C:/repo"])).toEqual({
      root: "D:/scratch/notes",
      relativePath: "todo.md",
    });
  });

  it("refuses a relative path, which has no root to anchor on", () => {
    expect(resolveFileSurfaceRoot("docs/notes.md", ["/repo"])).toBeNull();
    expect(resolveFileSurfaceRoot("./notes.md", ["/repo"])).toBeNull();
  });

  it("handles a project root recorded with a trailing separator", () => {
    expect(resolveFileSurfaceRoot("/repo/docs/notes.md", ["/repo/"])).toEqual({
      root: "/repo/",
      relativePath: "docs/notes.md",
    });
  });
});
