import { describe, expect, it } from "vite-plus/test";

import { formatFilePathForClipboard } from "./clipboardPath";

describe("formatFilePathForClipboard", () => {
  it("uses backslashes for paths on a Windows host", () => {
    expect(formatFilePathForClipboard("C:/Users/me/project/src/app.ts")).toBe(
      String.raw`C:\Users\me\project\src\app.ts`,
    );
    expect(formatFilePathForClipboard("src/app.ts", String.raw`C:\Users\me\project`)).toBe(
      String.raw`src\app.ts`,
    );
    expect(formatFilePathForClipboard("share/app.ts", String.raw`\\server\share`)).toBe(
      String.raw`share\app.ts`,
    );
  });

  it("leaves paths on a POSIX host alone", () => {
    expect(formatFilePathForClipboard("/home/me/project/src/app.ts")).toBe(
      "/home/me/project/src/app.ts",
    );
    expect(formatFilePathForClipboard("src/app.ts", "/home/me/project")).toBe("src/app.ts");
  });
});
