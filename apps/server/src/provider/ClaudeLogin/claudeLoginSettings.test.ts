import {
  DEFAULT_SERVER_SETTINGS,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerSettings,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLAUDE_DRIVER_KIND, resolveClaudeLoginTarget } from "./claudeLoginSettings.ts";

const DEFAULT_INSTANCE_ID = ProviderInstanceId.make("claudeAgent");
const SECOND_INSTANCE_ID = ProviderInstanceId.make("claude_personal");

const makeSettings = (
  overrides: Partial<Pick<ServerSettings, "providerInstances" | "providers">>,
): Pick<ServerSettings, "providerInstances" | "providers"> => ({
  providers: DEFAULT_SERVER_SETTINGS.providers,
  providerInstances: {},
  ...overrides,
});

describe("resolveClaudeLoginTarget", () => {
  it("falls back to the legacy provider block for the default instance", () => {
    const settings = makeSettings({
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        claudeAgent: {
          ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent,
          homePath: "~/.claude-work",
        },
      },
    });

    // The default instance is absent from `providerInstances` until the user
    // edits it, so legacy settings remain the source of truth for it.
    expect(resolveClaudeLoginTarget(settings, DEFAULT_INSTANCE_ID)?.settings.homePath).toBe(
      "~/.claude-work",
    );
  });

  it("reads a configured instance's own Claude home", () => {
    const settings = makeSettings({
      providerInstances: {
        [SECOND_INSTANCE_ID]: {
          driver: CLAUDE_DRIVER_KIND,
          config: { homePath: "~/.claude-personal", binaryPath: "claude" },
          displayName: "Claude Personal",
        },
      },
    });

    const resolved = resolveClaudeLoginTarget(settings, SECOND_INSTANCE_ID);

    // Signing the wrong config directory in is the exact failure this whole
    // feature exists to prevent, so this assertion is the load-bearing one.
    expect(resolved?.settings.homePath).toBe("~/.claude-personal");
    expect(resolved?.settings.binaryPath).toBe("claude");
    expect(resolved?.displayName).toBe("Claude Personal");
  });

  it("prefers an explicit default-instance entry over the legacy block", () => {
    const settings = makeSettings({
      providers: {
        ...DEFAULT_SERVER_SETTINGS.providers,
        claudeAgent: { ...DEFAULT_SERVER_SETTINGS.providers.claudeAgent, homePath: "~/.legacy" },
      },
      providerInstances: {
        [DEFAULT_INSTANCE_ID]: {
          driver: CLAUDE_DRIVER_KIND,
          config: { homePath: "~/.migrated" },
        },
      },
    });

    expect(resolveClaudeLoginTarget(settings, DEFAULT_INSTANCE_ID)?.settings.homePath).toBe(
      "~/.migrated",
    );
  });

  it("carries the instance's environment overrides", () => {
    const settings = makeSettings({
      providerInstances: {
        [SECOND_INSTANCE_ID]: {
          driver: CLAUDE_DRIVER_KIND,
          config: {},
          environment: [{ name: "ANTHROPIC_BASE_URL", value: "https://openrouter.ai/api" }],
        },
      },
    });

    expect(resolveClaudeLoginTarget(settings, SECOND_INSTANCE_ID)?.environment).toEqual([
      { name: "ANTHROPIC_BASE_URL", value: "https://openrouter.ai/api" },
    ]);
  });

  it("refuses an instance belonging to another driver", () => {
    const settings = makeSettings({
      providerInstances: {
        [SECOND_INSTANCE_ID]: { driver: ProviderDriverKind.make("codex"), config: {} },
      },
    });

    // `claude auth login` would sign in a Claude account regardless of which
    // instance was clicked, so a driver mismatch must not resolve.
    expect(resolveClaudeLoginTarget(settings, SECOND_INSTANCE_ID)).toBeUndefined();
  });

  it("refuses an unknown instance id", () => {
    expect(
      resolveClaudeLoginTarget(makeSettings({}), ProviderInstanceId.make("does_not_exist")),
    ).toBeUndefined();
  });

  it("refuses an entry whose config does not decode", () => {
    const settings = makeSettings({
      providerInstances: {
        [SECOND_INSTANCE_ID]: {
          driver: CLAUDE_DRIVER_KIND,
          config: { binaryPath: 42 },
        },
      },
    });

    expect(resolveClaudeLoginTarget(settings, SECOND_INSTANCE_ID)).toBeUndefined();
  });
});
