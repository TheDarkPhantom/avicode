import { describe, expect, it } from "vite-plus/test";

import {
  isAbsoluteWorkspacePath,
  isWithinWorkspaceRoot,
  workspacePathBasename,
  workspacePathDirname,
  workspaceRelativePathWithin,
} from "./workspacePathMatch";

describe("workspaceRelativePathWithin", () => {
  it("returns the path relative to the root", () => {
    expect(workspaceRelativePathWithin("/repo", "/repo/src/index.ts")).toBe("src/index.ts");
  });

  it("treats Windows separators and case as equivalent", () => {
    expect(
      workspaceRelativePathWithin("C:/Users/avi/dev/repo", "c:\\Users\\avi\\dev\\Repo\\docs\\a.md"),
    ).toBe("docs/a.md");
  });

  it("reports outside as outside rather than emitting a .. escape", () => {
    expect(workspaceRelativePathWithin("/repo", "/other/src/index.ts")).toBeNull();
    expect(workspaceRelativePathWithin("/repo", "/repository/src/index.ts")).toBeNull();
  });

  it("does not treat the root itself as a file inside it", () => {
    expect(workspaceRelativePathWithin("/repo", "/repo")).toBeNull();
  });

  it("returns null without a root", () => {
    expect(workspaceRelativePathWithin(undefined, "/repo/a.md")).toBeNull();
  });
});

describe("isWithinWorkspaceRoot", () => {
  it("accepts the root itself and anything under it", () => {
    expect(isWithinWorkspaceRoot("/repo", "/repo")).toBe(true);
    expect(isWithinWorkspaceRoot("/repo", "/repo/src")).toBe(true);
  });

  it("rejects a sibling whose name merely starts the same", () => {
    expect(isWithinWorkspaceRoot("/repo", "/repository")).toBe(false);
  });
});

describe("isAbsoluteWorkspacePath", () => {
  it("recognises posix and Windows drive paths", () => {
    expect(isAbsoluteWorkspacePath("/repo/a.md")).toBe(true);
    expect(isAbsoluteWorkspacePath("C:\\repo\\a.md")).toBe(true);
    expect(isAbsoluteWorkspacePath("/C:/repo/a.md")).toBe(true);
  });

  it("rejects relative paths", () => {
    expect(isAbsoluteWorkspacePath("docs/a.md")).toBe(false);
    expect(isAbsoluteWorkspacePath("./a.md")).toBe(false);
  });
});

describe("workspacePathBasename and workspacePathDirname", () => {
  it("splits a path into its last segment and its parent", () => {
    expect(workspacePathBasename("C:/Users/avi/dev/repo")).toBe("repo");
    expect(workspacePathDirname("C:/Users/avi/dev/repo/a.md")).toBe("C:/Users/avi/dev/repo");
  });

  it("keeps the root slash for a file at the filesystem root", () => {
    expect(workspacePathDirname("/a.md")).toBe("/");
  });

  it("ignores a trailing separator", () => {
    expect(workspacePathBasename("/repo/docs/")).toBe("docs");
  });
});
