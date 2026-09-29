import { describe, expect, it } from "vite-plus/test";

import { isUtilityPage } from "./mainAppLocation";

describe("isUtilityPage", () => {
  it("treats settings, usage, and the changelog as utility pages", () => {
    for (const pathname of [
      "/settings",
      "/settings/general",
      "/settings/avicode",
      "/usage",
      "/changelog",
    ]) {
      expect(isUtilityPage(pathname)).toBe(true);
    }
  });

  it("treats threads, drafts, and the thread list as the main app", () => {
    for (const pathname of ["/", "/env-1/thread-1", "/draft/draft-1", "/settingsx", "/usage/x"]) {
      expect(isUtilityPage(pathname)).toBe(false);
    }
  });
});
