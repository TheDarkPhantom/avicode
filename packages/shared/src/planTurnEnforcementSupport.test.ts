import { describe, expect, it } from "vite-plus/test";

import { driverEnforcesPlanTurns } from "./planTurnEnforcementSupport.ts";

describe("driverEnforcesPlanTurns", () => {
  it("reports the Claude adapter as enforcing plan turns", () => {
    expect(driverEnforcesPlanTurns("claudeAgent")).toBe(true);
  });

  it("reports every other backend as not enforcing", () => {
    for (const driverKind of ["codex", "cursor", "grok", "opencode"]) {
      expect(driverEnforcesPlanTurns(driverKind)).toBe(false);
    }
  });

  it("treats an unknown or absent driver as not enforcing", () => {
    expect(driverEnforcesPlanTurns("something-new")).toBe(false);
    expect(driverEnforcesPlanTurns(null)).toBe(false);
    expect(driverEnforcesPlanTurns(undefined)).toBe(false);
  });
});
