import { describe, expect, it } from "vite-plus/test";
import { makeLegacyT3ImportPlan } from "./LegacyT3Import.ts";

describe("LegacyT3Import", () => {
  it("keeps the legacy source and AviCode destination separate", () => {
    const plan = makeLegacyT3ImportPlan({
      homeDirectory: "C:\\Users\\Avi",
      targetStateDir: "C:\\Users\\Avi\\.avicode\\userdata",
    });
    expect(plan.legacyDatabase).toContain(".t3");
    expect(plan.targetDatabase).toContain(".avicode");
    expect(plan.legacyDatabase).not.toBe(plan.targetDatabase);
  });
});
