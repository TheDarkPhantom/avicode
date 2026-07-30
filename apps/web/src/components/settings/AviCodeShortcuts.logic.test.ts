import { describe, expect, it } from "vite-plus/test";
import type { KeybindingShortcut, ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { DEFAULT_RESOLVED_KEYBINDINGS } from "@t3tools/shared/keybindings";

import {
  buildBuiltInShortcutGroups,
  buildConfigurableShortcutGroups,
  filterShortcutGroups,
  shortcutContextLabel,
  splitChordParts,
  type ShortcutGroup,
} from "./AviCodeShortcuts.logic";

const WINDOWS = "Win32";
const MAC = "MacIntel";

function modShortcut(key: string, overrides?: Partial<KeybindingShortcut>): KeybindingShortcut {
  return {
    key,
    modKey: true,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...overrides,
  };
}

function findEntry(groups: ReadonlyArray<ShortcutGroup>, label: string) {
  return groups.flatMap((group) => group.entries).find((entry) => entry.label === label);
}

describe("AviCodeShortcuts.logic", () => {
  describe("buildConfigurableShortcutGroups", () => {
    it("labels chords for the current platform", () => {
      const config: ResolvedKeybindingsConfig = [
        { command: "sidebar.toggle", shortcut: modShortcut("b") },
      ];

      expect(
        findEntry(buildConfigurableShortcutGroups(config, config, WINDOWS), "Sidebar: Toggle"),
      ).toMatchObject({ chords: ["Ctrl+B"] });
      expect(
        findEntry(buildConfigurableShortcutGroups(config, config, MAC), "Sidebar: Toggle"),
      ).toMatchObject({ chords: ["⌘B"] });
    });

    it("merges alternative chords for one command into a single entry", () => {
      const config: ResolvedKeybindingsConfig = [
        {
          command: "chat.new",
          shortcut: modShortcut("n"),
          whenAst: { type: "not", node: { type: "identifier", name: "terminalFocus" } },
        },
        {
          command: "chat.new",
          shortcut: modShortcut("o", { shiftKey: true }),
          whenAst: { type: "not", node: { type: "identifier", name: "terminalFocus" } },
        },
      ];

      const entry = findEntry(
        buildConfigurableShortcutGroups(config, config, WINDOWS),
        "Chat: New",
      );
      expect(entry).toMatchObject({
        chords: ["Ctrl+N", "Ctrl+Shift+O"],
        chordJoin: "or",
        context: "Outside the terminal",
      });
    });

    it("keeps one command's contexts apart", () => {
      const config: ResolvedKeybindingsConfig = [
        {
          command: "terminal.new",
          shortcut: modShortcut("n"),
          whenAst: { type: "identifier", name: "terminalFocus" },
        },
        {
          command: "terminal.new",
          shortcut: modShortcut("t"),
          whenAst: { type: "identifier", name: "terminalOpen" },
        },
      ];

      const entries = buildConfigurableShortcutGroups(config, config, WINDOWS).flatMap(
        (group) => group.entries,
      );
      expect(entries).toHaveLength(2);
      expect(entries.map((entry) => entry.context)).toEqual([
        "In the terminal",
        "When the terminal is open",
      ]);
    });

    it("collapses a jump family to its numeric ends, not its config order", () => {
      // A user override moves `thread.jump.5` to the end of the merged config;
      // ordering by arrival would render the range as "Ctrl+1 … Ctrl+5".
      const config: ResolvedKeybindingsConfig = [
        { command: "thread.jump.1", shortcut: modShortcut("1") },
        { command: "thread.jump.2", shortcut: modShortcut("2") },
        { command: "thread.jump.3", shortcut: modShortcut("3") },
        { command: "thread.jump.5", shortcut: modShortcut("5") },
        { command: "thread.jump.4", shortcut: modShortcut("4") },
      ];

      const entry = findEntry(
        buildConfigurableShortcutGroups(config, config, WINDOWS),
        "Jump to chat by position",
      );
      expect(entry).toMatchObject({
        chords: ["Ctrl+1", "Ctrl+5"],
        chordJoin: "through",
      });
    });

    it("flags a rebound command as customized", () => {
      const defaults: ResolvedKeybindingsConfig = [
        { command: "sidebar.toggle", shortcut: modShortcut("b") },
      ];
      const custom: ResolvedKeybindingsConfig = [
        { command: "sidebar.toggle", shortcut: modShortcut("e") },
      ];

      expect(
        findEntry(buildConfigurableShortcutGroups(defaults, defaults, WINDOWS), "Sidebar: Toggle")
          ?.customized,
      ).toBe(false);
      expect(
        findEntry(buildConfigurableShortcutGroups(custom, defaults, WINDOWS), "Sidebar: Toggle")
          ?.customized,
      ).toBe(true);
    });

    it("groups every shipped default under a titled section", () => {
      const groups = buildConfigurableShortcutGroups(
        DEFAULT_RESOLVED_KEYBINDINGS,
        DEFAULT_RESOLVED_KEYBINDINGS,
        WINDOWS,
      );

      expect(groups.map((group) => group.title)).toEqual([
        "Window & panels",
        "Chat & composer",
        "Chats",
        "Terminal",
        "Preview browser",
      ]);
      // Nothing silently dropped: every default command is represented.
      const rendered = new Set(
        groups.flatMap((group) => group.entries).map((entry) => entry.label),
      );
      expect(rendered.has("Command Palette: Toggle")).toBe(true);
      expect(rendered.has("Jump to chat by position")).toBe(true);
      expect(rendered.has("Pick model by position")).toBe(true);
      expect(groups.every((group) => group.entries.length > 0)).toBe(true);
    });

    it("puts an unrecognised command prefix in Other rather than dropping it", () => {
      const config: ResolvedKeybindingsConfig = [
        { command: "script.test.run", shortcut: modShortcut("t") },
      ];
      const groups = buildConfigurableShortcutGroups(config, config, WINDOWS);
      expect(groups.map((group) => group.title)).toEqual(["Project scripts"]);
      expect(groups[0]?.entries[0]?.label).toBe("Run Script: Test");
    });
  });

  describe("shortcutContextLabel", () => {
    it("phrases known when-clauses and passes through unknown ones", () => {
      expect(shortcutContextLabel("")).toBeNull();
      expect(shortcutContextLabel("!terminalFocus")).toBe("Outside the terminal");
      expect(shortcutContextLabel("previewFocus && previewOpen")).toBe("In the preview");
      expect(shortcutContextLabel("somethingCustom")).toBe("somethingCustom");
    });
  });

  describe("buildBuiltInShortcutGroups", () => {
    it("lists the macOS-only editing chords only on macOS", () => {
      const macLabels = buildBuiltInShortcutGroups(MAC)
        .flatMap((group) => group.entries)
        .map((entry) => entry.label);
      const windowsLabels = buildBuiltInShortcutGroups(WINDOWS)
        .flatMap((group) => group.entries)
        .map((entry) => entry.label);

      expect(macLabels).toContain("Delete to start of line");
      expect(windowsLabels).not.toContain("Delete to start of line");
    });

    it("covers the composer send and newline chords", () => {
      const groups = buildBuiltInShortcutGroups(WINDOWS);
      expect(findEntry(groups, "Send the prompt")).toMatchObject({ chords: ["Enter"] });
      expect(findEntry(groups, "Insert a line break")).toMatchObject({
        chords: ["Shift+Enter"],
      });
    });
  });

  describe("splitChordParts", () => {
    it("keeps a macOS glyph run as one cap and splits Windows chords", () => {
      expect(splitChordParts("⇧⌘O")).toEqual(["⇧⌘O"]);
      expect(splitChordParts("Ctrl+Shift+O")).toEqual(["Ctrl", "Shift", "O"]);
      expect(splitChordParts("Enter")).toEqual(["Enter"]);
    });

    it("renders a literal plus key rather than blank caps", () => {
      expect(splitChordParts("Ctrl++")).toEqual(["Ctrl", "+"]);
      expect(splitChordParts("Ctrl+Shift+=")).toEqual(["Ctrl", "Shift", "="]);
    });
  });

  describe("filterShortcutGroups", () => {
    const groups = buildConfigurableShortcutGroups(
      DEFAULT_RESOLVED_KEYBINDINGS,
      DEFAULT_RESOLVED_KEYBINDINGS,
      WINDOWS,
    );

    it("returns the input unchanged for a blank query", () => {
      expect(filterShortcutGroups(groups, "   ")).toBe(groups);
    });

    it("matches on action name", () => {
      const labels = filterShortcutGroups(groups, "palette").flatMap((group) =>
        group.entries.map((entry) => entry.label),
      );
      expect(labels).toEqual(["Command Palette: Toggle"]);
    });

    it("matches a chord with or without modifier punctuation", () => {
      for (const query of ["Ctrl+K", "ctrlk", "ctrl k"]) {
        const labels = filterShortcutGroups(groups, query).flatMap((group) =>
          group.entries.map((entry) => entry.label),
        );
        expect(labels, query).toContain("Command Palette: Toggle");
      }
    });

    it("drops groups that have no surviving entries", () => {
      expect(filterShortcutGroups(groups, "zzzz-no-such-shortcut")).toEqual([]);
    });
  });
});
