import type { ProjectScript } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { primaryProjectScript, worktreeCreateProjectScript } from "./projectScripts.ts";

const scripts: readonly ProjectScript[] = [
  { id: "dev", name: "Dev", command: "pnpm dev", icon: "play", runOnWorktreeCreate: false },
  {
    id: "setup",
    name: "Setup",
    command: "pnpm install",
    icon: "configure",
    runOnWorktreeCreate: true,
  },
];

describe("project script selection", () => {
  it("selects the first regular action as primary", () => {
    expect(primaryProjectScript(scripts)?.id).toBe("dev");
  });

  it("keeps explicit worktree setup authoritative", () => {
    expect(worktreeCreateProjectScript(scripts, true)?.id).toBe("setup");
  });

  it("uses the primary action only when fallback is enabled", () => {
    expect(worktreeCreateProjectScript(scripts.slice(0, 1), false)).toBeNull();
    expect(worktreeCreateProjectScript(scripts.slice(0, 1), true)?.id).toBe("dev");
  });
});
