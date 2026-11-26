import { assert, it } from "@effect/vitest";

import {
  MACOS_MANAGED_PREFERENCES_PATH,
  managedPolicyPath,
  WINDOWS_POLICY_KEY,
} from "./managedPolicyFile.ts";

it("reads Avi Code 2's admin policy, never one deployed for T3 Code", () => {
  assert.equal(managedPolicyPath("win32"), "C:\\Program Files\\AviCode2\\policy.json");
  assert.equal(managedPolicyPath("darwin"), "/Library/Application Support/AviCode2/policy.json");
  assert.equal(managedPolicyPath("linux"), "/etc/avicode2/policy.json");
  assert.equal(WINDOWS_POLICY_KEY, "HKLM\\SOFTWARE\\Policies\\AdvisorAvi\\AviCode2");
  assert.equal(
    MACOS_MANAGED_PREFERENCES_PATH,
    "/Library/Managed Preferences/com.advisoravi.avicode2.plist",
  );
});
