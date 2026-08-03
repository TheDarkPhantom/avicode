import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { CLAUDE_DRIVER_KIND } from "./claudeDriverKind";
import {
  collectClaudeConfigDirs,
  DEFAULT_CLAUDE_CONFIG_DIR,
  findClaudeConfigDirSiblings,
  normalizeClaudeConfigDir,
  resolveClaudeConfigDir,
  suggestClaudeConfigDir,
} from "./claudeConfigDir";

const DEFAULT_ID = ProviderInstanceId.make("claudeAgent");
const AVI_ID = ProviderInstanceId.make("claudeAgent_avi");
const LAWRENCE_ID = ProviderInstanceId.make("claude-avi");

const claudeEntry = (homePath: string | undefined, displayName?: string) => ({
  driver: CLAUDE_DRIVER_KIND,
  ...(displayName ? { displayName } : {}),
  config: homePath === undefined ? {} : { homePath },
});

describe("suggestClaudeConfigDir", () => {
  it("derives a readable directory from the instance id", () => {
    expect(suggestClaudeConfigDir("claudeAgent_avi")).toBe("~/.claude-avi");
    expect(suggestClaudeConfigDir("Claude -- Lawrence!")).toBe("~/.claude-lawrence");
  });

  it("never suggests a directory another instance already uses", () => {
    // Dropping the driver prefix makes short names likely to collide, and a
    // colliding suggestion would recreate the shared-credential bug this
    // whole module exists to prevent.
    expect(suggestClaudeConfigDir("claudeAgent_avi", ["~/.claude-avi"])).toBe("~/.claude-avi-2");
    expect(suggestClaudeConfigDir("claudeAgent_avi", ["~/.claude-avi", "~/.claude-avi-2"])).toBe(
      "~/.claude-avi-3",
    );
  });

  it("compares taken directories the way the filesystem does", () => {
    expect(suggestClaudeConfigDir("avi", ["C:\\Users\\avi-r\\.claude-avi"])).toBe("~/.claude-avi");
    expect(suggestClaudeConfigDir("avi", ["~/.CLAUDE-AVI/"])).toBe("~/.claude-avi-2");
  });

  it("falls back to the default when the id has nothing usable", () => {
    expect(suggestClaudeConfigDir("---")).toBe(DEFAULT_CLAUDE_CONFIG_DIR);
    expect(suggestClaudeConfigDir("claude")).toBe(DEFAULT_CLAUDE_CONFIG_DIR);
  });
});

describe("collectClaudeConfigDirs", () => {
  it("gathers every directory a Claude instance holds, including the default", () => {
    const dirs = collectClaudeConfigDirs({
      instances: {
        [AVI_ID]: claudeEntry(""),
        [LAWRENCE_ID]: claudeEntry("~/.claude-avi"),
        [ProviderInstanceId.make("codex")]: {
          driver: ProviderDriverKind.make("codex"),
          config: { homePath: "~/.codex-avi" },
        },
      },
      legacyClaudeHomePath: "",
    });

    expect([...dirs].sort()).toEqual(["~/.claude", "~/.claude", "~/.claude-avi"]);
  });
});

describe("resolveClaudeConfigDir", () => {
  it("treats empty and whitespace as the default directory", () => {
    expect(resolveClaudeConfigDir("")).toBe(DEFAULT_CLAUDE_CONFIG_DIR);
    expect(resolveClaudeConfigDir("   ")).toBe(DEFAULT_CLAUDE_CONFIG_DIR);
    expect(resolveClaudeConfigDir(undefined)).toBe(DEFAULT_CLAUDE_CONFIG_DIR);
  });
});

describe("normalizeClaudeConfigDir", () => {
  it("ignores separator style, trailing slashes and case", () => {
    expect(normalizeClaudeConfigDir("C:\\Users\\avi-r\\.Claude-Avi\\")).toBe(
      normalizeClaudeConfigDir("C:/Users/avi-r/.claude-avi"),
    );
  });
});

describe("findClaudeConfigDirSiblings", () => {
  it("catches the real collision: a new instance left on the default directory", () => {
    // This is the reported failure. `claudeAgent_avi` was created with the
    // config step untouched, so it silently shared `~/.claude` with the
    // default instance and signing in on one re-authenticated the other.
    const siblings = findClaudeConfigDirSiblings({
      instances: {
        [DEFAULT_ID]: claudeEntry("", "Claude - Will"),
        [AVI_ID]: claudeEntry("", "Avi"),
        [LAWRENCE_ID]: claudeEntry("C:\\Users\\avi-r\\.claude-avi", "Claude – Lawrence"),
      },
      legacyClaudeHomePath: "",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([{ instanceId: DEFAULT_ID, label: "Claude - Will" }]);
  });

  it("sees the default instance even when it is absent from the map", () => {
    // Until the default instance is edited it lives only in the legacy
    // `providers.claudeAgent` block, which is the most common shape of all.
    const siblings = findClaudeConfigDirSiblings({
      instances: { [AVI_ID]: claudeEntry("", "Avi") },
      legacyClaudeHomePath: "",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([{ instanceId: DEFAULT_ID, label: "Claude" }]);
  });

  it("stays quiet when every instance has its own directory", () => {
    const siblings = findClaudeConfigDirSiblings({
      instances: {
        [DEFAULT_ID]: claudeEntry(""),
        [AVI_ID]: claudeEntry("~/.claude-avi-agent"),
        [LAWRENCE_ID]: claudeEntry("~/.claude-avi"),
      },
      legacyClaudeHomePath: "",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([]);
  });

  it("matches directories that differ only by separator or case", () => {
    const siblings = findClaudeConfigDirSiblings({
      instances: {
        [AVI_ID]: claudeEntry("C:/Users/avi-r/.claude-avi"),
        [LAWRENCE_ID]: claudeEntry("C:\\Users\\avi-r\\.Claude-Avi", "Lawrence"),
      },
      legacyClaudeHomePath: "",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([{ instanceId: LAWRENCE_ID, label: "Lawrence" }]);
  });

  it("ignores instances belonging to other drivers", () => {
    const siblings = findClaudeConfigDirSiblings({
      instances: {
        [AVI_ID]: claudeEntry(""),
        [ProviderInstanceId.make("codex")]: {
          driver: ProviderDriverKind.make("codex"),
          config: { homePath: "" },
        },
      },
      legacyClaudeHomePath: "",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    // A Codex instance on its own default home shares nothing with Claude.
    expect(siblings).toEqual([{ instanceId: DEFAULT_ID, label: "Claude" }]);
  });

  it("returns nothing for an instance that is not Claude", () => {
    const codexId = ProviderInstanceId.make("codex");
    const siblings = findClaudeConfigDirSiblings({
      instances: {
        [codexId]: { driver: ProviderDriverKind.make("codex"), config: {} },
        [AVI_ID]: claudeEntry(""),
      },
      legacyClaudeHomePath: "",
      instanceId: codexId,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([]);
  });

  it("uses the legacy home path when the default instance has a custom one", () => {
    const siblings = findClaudeConfigDirSiblings({
      instances: { [AVI_ID]: claudeEntry("~/.claude-shared", "Avi") },
      legacyClaudeHomePath: "~/.claude-shared",
      instanceId: AVI_ID,
      defaultInstanceId: DEFAULT_ID,
    });

    expect(siblings).toEqual([{ instanceId: DEFAULT_ID, label: "Claude" }]);
  });
});
