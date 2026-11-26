import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import {
  EnvironmentId,
  type KeybindingCommand,
  type KeybindingRule,
  ThreadId,
} from "@t3tools/contracts";
import {
  compileResolvedKeybindingsConfig,
  DEFAULT_KEYBINDINGS,
  mergeWithDefaultKeybindings,
} from "@t3tools/shared/keybindings";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { resolveShortcutCommand, type ShortcutEventLike } from "../keybindings";
import {
  type ArchivedThreads,
  closeOrArchiveSteps,
  pickLastArchivedThread,
  resolveReopenTarget,
  withoutCommand,
} from "./threadCloseReopen";

const ctrlW: ShortcutEventLike = {
  key: "w",
  metaKey: false,
  ctrlKey: true,
  shiftKey: false,
  altKey: false,
};
const ctrlShiftT: ShortcutEventLike = { ...ctrlW, key: "T", shiftKey: true };
const options = (context: Record<string, boolean>) => ({ platform: "Win32", context });
const defaults = compileResolvedKeybindingsConfig(DEFAULT_KEYBINDINGS);
const withoutRule = (rules: ReadonlyArray<KeybindingRule>, command: KeybindingCommand) =>
  rules.filter((rule) => rule.command !== command);

describe("mod+w defaults", () => {
  it("closes the terminal, then the right panel, then archives the thread", () => {
    expect(
      resolveShortcutCommand(
        ctrlW,
        defaults,
        options({ terminalFocus: true, rightPanelOpen: true }),
      ),
    ).toBe("terminal.close");
    expect(
      resolveShortcutCommand(
        ctrlW,
        defaults,
        options({ terminalFocus: true, rightPanelOpen: false }),
      ),
    ).toBe("terminal.close");
    expect(
      resolveShortcutCommand(
        ctrlW,
        defaults,
        options({ terminalFocus: false, rightPanelOpen: true }),
      ),
    ).toBe("rightPanel.close");
    expect(
      resolveShortcutCommand(
        ctrlW,
        defaults,
        options({ terminalFocus: false, rightPanelOpen: false }),
      ),
    ).toBe("thread.archive");
  });

  it("keeps mod+shift+t on reopen closed view", () => {
    expect(resolveShortcutCommand(ctrlShiftT, defaults, options({}))).toBe("view.reopenClosed");
  });
});

// The server backfills a new default ahead of the rules already in a user's keybindings.json.
const backfilled = compileResolvedKeybindingsConfig([
  ...DEFAULT_KEYBINDINGS.filter((rule) => rule.command === "thread.archive"),
  ...DEFAULT_KEYBINDINGS.filter((rule) => rule.command !== "thread.archive"),
]);
// The old Avi Code's rules, which the first start copies; the client puts custom rules last.
const legacy = mergeWithDefaultKeybindings(
  compileResolvedKeybindingsConfig([
    { key: "mod+w", command: "terminal.close", when: "terminalFocus" },
    { key: "mod+w", command: "thread.archive", when: "!terminalFocus" },
    { key: "mod+shift+t", command: "thread.reopenLastArchived", when: "!terminalFocus" },
  ]),
);

describe("closeOrArchiveSteps", () => {
  // The handler closes the tab whenever `close` holds, so `archive` with a panel open is moot.
  it.each([
    ["default", defaults, false],
    ["backfilled", backfilled, false],
    ["old Avi Code", legacy, true],
  ])("closes a panel tab first, then archives, with %s keybindings", (_name, keybindings, moot) => {
    expect(
      closeOrArchiveSteps(ctrlW, keybindings, { terminalFocus: false, rightPanelOpen: true }),
    ).toEqual({ close: true, archive: moot });
    expect(
      closeOrArchiveSteps(ctrlW, keybindings, { terminalFocus: false, rightPanelOpen: false }),
    ).toEqual({ close: true, archive: true });
    expect(
      closeOrArchiveSteps(ctrlW, keybindings, { terminalFocus: true, rightPanelOpen: false }),
    ).toEqual({ close: false, archive: false });
  });

  it("does not archive once the user moves the archive shortcut elsewhere", () => {
    const rebound = compileResolvedKeybindingsConfig([
      ...withoutRule(DEFAULT_KEYBINDINGS, "thread.archive"),
      { key: "mod+shift+w", command: "thread.archive" },
    ]);
    const context = { terminalFocus: false, rightPanelOpen: false };
    expect(closeOrArchiveSteps(ctrlW, rebound, context)).toEqual({ close: true, archive: false });
    expect(closeOrArchiveSteps({ ...ctrlW, key: "W", shiftKey: true }, rebound, context)).toEqual({
      close: false,
      archive: true,
    });
  });
});

describe("resolveReopenTarget", () => {
  it.each([
    ["default", defaults],
    ["old Avi Code", legacy],
  ])("reopens closed views first, then archived threads, with %s keybindings", (_name, kb) => {
    expect(resolveReopenTarget(ctrlShiftT, kb, {}, 2)).toBe("closed-view");
    expect(resolveReopenTarget(ctrlShiftT, kb, {}, 0)).toBe("archived-thread");
  });

  it("agrees with the closed-view listener, which resolves without reopen-archived rules", () => {
    const closedViewCommand = resolveShortcutCommand(
      ctrlShiftT,
      withoutCommand(legacy, "thread.reopenLastArchived"),
      options({}),
    );
    expect(closedViewCommand).toBe("view.reopenClosed");
  });

  it("reopens archived threads on a key bound only to that", () => {
    const kb = compileResolvedKeybindingsConfig([
      ...DEFAULT_KEYBINDINGS,
      { key: "mod+alt+t", command: "thread.reopenLastArchived" },
    ]);
    expect(resolveReopenTarget({ ...ctrlW, key: "t", altKey: true }, kb, {}, 2)).toBe(
      "archived-thread",
    );
  });

  it("leaves other keys and a rebound mod+shift+t alone", () => {
    expect(resolveReopenTarget(ctrlW, defaults, {}, 0)).toBeNull();
    const rebound = compileResolvedKeybindingsConfig([
      ...DEFAULT_KEYBINDINGS,
      { key: "mod+shift+t", command: "terminal.toggle" },
    ]);
    expect(resolveReopenTarget(ctrlShiftT, rebound, {}, 0)).toBeNull();
  });
});

describe("pickLastArchivedThread", () => {
  const local = EnvironmentId.make("local");
  const remote = EnvironmentId.make("remote");
  const thread = (
    id: string,
    archivedAt: string | null,
    lineage: Partial<ArchivedThreads["threads"][number]["lineage"]> = {},
  ): ArchivedThreads["threads"][number] => ({
    id: ThreadId.make(id),
    createdAt: DateTime.makeUnsafe("2026-01-01T00:00:00.000Z"),
    archivedAt: archivedAt === null ? null : DateTime.makeUnsafe(archivedAt),
    lineage: {
      parentThreadId: null,
      relationshipToParent: null,
      rootThreadId: ThreadId.make(id),
      ...lineage,
    },
  });

  it("picks the most recently archived listed thread across environments", () => {
    const archives: ArchivedThreads[] = [
      { environmentId: local, threads: [thread("a", "2026-03-01T00:00:00.000Z")] },
      {
        environmentId: remote,
        threads: [
          thread("b", "2026-03-02T00:00:00.000Z"),
          thread("sub", "2026-03-03T00:00:00.000Z", { relationshipToParent: "subagent" }),
          thread("side", "2026-03-03T00:00:00.000Z", { sideChat: true }),
        ],
      },
    ];
    expect(pickLastArchivedThread(archives, new Set())?.ref).toEqual(
      scopeThreadRef(remote, ThreadId.make("b")),
    );
  });

  it("walks back past archivings already reopened", () => {
    const archives: ArchivedThreads[] = [
      {
        environmentId: local,
        threads: [thread("a", "2026-03-01T00:00:00.000Z"), thread("b", "2026-03-02T00:00:00.000Z")],
      },
    ];
    const first = pickLastArchivedThread(archives, new Set());
    expect(first?.ref.threadId).toBe("b");
    const second = pickLastArchivedThread(archives, new Set([first!.archiveKey]));
    expect(second?.ref.threadId).toBe("a");
    expect(
      pickLastArchivedThread(archives, new Set([first!.archiveKey, second!.archiveKey])),
    ).toBeNull();
  });

  it("treats a thread archived again as a new candidate", () => {
    const before = pickLastArchivedThread(
      [{ environmentId: local, threads: [thread("a", "2026-03-01T00:00:00.000Z")] }],
      new Set(),
    );
    const again = pickLastArchivedThread(
      [{ environmentId: local, threads: [thread("a", "2026-03-05T00:00:00.000Z")] }],
      new Set([before!.archiveKey]),
    );
    expect(again?.ref.threadId).toBe("a");
  });
});
