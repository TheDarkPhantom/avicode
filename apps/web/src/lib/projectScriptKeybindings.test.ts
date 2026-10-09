import { MAX_KEYBINDING_VALUE_LENGTH, type KeybindingCommand } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { commandForProjectScript } from "../projectScripts";
import {
  decodeProjectScriptKeybindingRule,
  keybindingValueForCommand,
  planProjectScriptKeybindingWrites,
  PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE,
} from "./projectScriptKeybindings";

describe("projectScriptKeybindings", () => {
  it("decodes and trims valid keybinding rules", () => {
    const rule = decodeProjectScriptKeybindingRule({
      keybinding: "  mod+k  ",
      command: commandForProjectScript("lint"),
    });

    expect(rule).toEqual({
      key: "mod+k",
      command: "script.lint.run",
    });
  });

  it("returns null when keybinding is empty", () => {
    expect(
      decodeProjectScriptKeybindingRule({
        keybinding: "   ",
        command: commandForProjectScript("lint"),
      }),
    ).toBeNull();
  });

  it("rejects invalid keybinding values", () => {
    expect(() =>
      decodeProjectScriptKeybindingRule({
        keybinding: "k".repeat(MAX_KEYBINDING_VALUE_LENGTH + 1),
        command: commandForProjectScript("lint"),
      }),
    ).toThrowError(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  });

  it("rejects invalid commands", () => {
    expect(() =>
      decodeProjectScriptKeybindingRule({
        keybinding: "mod+k",
        command: "script.BAD.run" as KeybindingCommand,
      }),
    ).toThrowError(PROJECT_SCRIPT_KEYBINDING_INVALID_MESSAGE);
  });

  it("reads latest matching keybinding value for a command", () => {
    const command = commandForProjectScript("test");
    const value = keybindingValueForCommand(
      [
        {
          command,
          shortcut: {
            key: "escape",
            metaKey: false,
            ctrlKey: false,
            shiftKey: false,
            altKey: false,
            modKey: true,
          },
        },
        {
          command,
          shortcut: {
            key: "k",
            metaKey: false,
            ctrlKey: false,
            shiftKey: true,
            altKey: false,
            modKey: true,
          },
        },
      ],
      command,
    );

    expect(value).toBe("mod+shift+k");
  });
});

describe("planProjectScriptKeybindingWrites", () => {
  const command = commandForProjectScript("dev");
  const shortcut = (key: string, extra: { shiftKey?: boolean } = {}) => ({
    key,
    metaKey: false,
    ctrlKey: false,
    shiftKey: extra.shiftKey ?? false,
    altKey: false,
    modKey: true,
  });
  const keybindings = [
    { command, shortcut: shortcut("k") },
    { command, shortcut: shortcut("j", { shiftKey: true }) },
    { command: commandForProjectScript("lint"), shortcut: shortcut("l") },
  ];
  const base = {
    command,
    scriptWasSaved: true,
    scriptRetainedElsewhere: false,
    keybindings,
  };

  it("replaces the previous shortcut and clears older duplicates", () => {
    expect(
      planProjectScriptKeybindingWrites({ ...base, nextRule: { key: "mod+u", command } }),
    ).toEqual({
      remove: [{ key: "mod+k", command }],
      upsert: { key: "mod+u", command, replace: { key: "mod+shift+j", command } },
    });
  });

  it("keeps an unchanged shortcut as a plain upsert", () => {
    expect(
      planProjectScriptKeybindingWrites({ ...base, nextRule: { key: "mod+shift+j", command } }),
    ).toEqual({ remove: [{ key: "mod+k", command }], upsert: { key: "mod+shift+j", command } });
  });

  it("removes every plain rule when the shortcut is cleared or the script deleted", () => {
    expect(planProjectScriptKeybindingWrites({ ...base, nextRule: null })).toEqual({
      remove: [
        { key: "mod+k", command },
        { key: "mod+shift+j", command },
      ],
      upsert: null,
    });
  });

  it("keeps the rule when another project still uses the script id", () => {
    expect(
      planProjectScriptKeybindingWrites({
        ...base,
        nextRule: null,
        scriptRetainedElsewhere: true,
      }),
    ).toEqual({ remove: [], upsert: null });
  });

  it("does nothing for a new script saved without a shortcut", () => {
    expect(
      planProjectScriptKeybindingWrites({ ...base, nextRule: null, scriptWasSaved: false }),
    ).toEqual({ remove: [], upsert: null });
  });

  it("leaves hand-written rules with a when clause alone", () => {
    expect(
      planProjectScriptKeybindingWrites({
        ...base,
        nextRule: null,
        keybindings: [
          {
            command,
            shortcut: shortcut("k"),
            whenAst: { type: "identifier", name: "terminalFocus" },
          },
        ],
      }),
    ).toEqual({ remove: [], upsert: null });
  });
});
