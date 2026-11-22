import { describe, expect, it } from "vite-plus/test";
import {
  isExplicitRelativePath,
  isNetworkPath,
  isUncPath,
  isWindowsAbsolutePath,
  isWindowsDrivePath,
} from "./path.ts";

describe("path helpers", () => {
  it("detects windows drive paths", () => {
    expect(isWindowsDrivePath("C:\\repo")).toBe(true);
    expect(isWindowsDrivePath("D:/repo")).toBe(true);
    expect(isWindowsDrivePath("/repo")).toBe(false);
  });

  it("detects UNC paths", () => {
    expect(isUncPath("\\\\server\\share\\repo")).toBe(true);
    expect(isUncPath("C:\\repo")).toBe(false);
  });

  it("detects network paths in every separator spelling", () => {
    for (const value of [
      "\\\\server\\share",
      "//server/share",
      "/\\server\\share",
      "\\/server/share",
      "\\\\?\\UNC\\server\\share",
    ]) {
      expect(isNetworkPath(value)).toBe(true);
    }
    for (const value of ["/repo", "C:\\repo", "\\repo", "./repo", "repo"]) {
      expect(isNetworkPath(value)).toBe(false);
    }
  });

  it("detects windows absolute paths", () => {
    expect(isWindowsAbsolutePath("C:\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("\\\\server\\share\\repo")).toBe(true);
    expect(isWindowsAbsolutePath("./repo")).toBe(false);
  });

  it("detects explicit relative paths", () => {
    expect(isExplicitRelativePath(".")).toBe(true);
    expect(isExplicitRelativePath("..")).toBe(true);
    expect(isExplicitRelativePath("./repo")).toBe(true);
    expect(isExplicitRelativePath("..\\repo")).toBe(true);
    expect(isExplicitRelativePath("~/repo")).toBe(false);
  });
});
