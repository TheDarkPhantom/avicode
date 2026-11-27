import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import {
  type EnvironmentId,
  isListedThreadLineage,
  type KeybindingCommand,
  type OrchestrationV2ThreadShell,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";

import {
  resolveShortcutCommand,
  type ShortcutEventLike,
  type ShortcutMatchContext,
} from "../keybindings";

/** The keybindings with these commands' rules left out, so a rule they shadow can win. */
export function withoutCommand(
  keybindings: ResolvedKeybindingsConfig,
  ...commands: ReadonlyArray<KeybindingCommand>
): ResolvedKeybindingsConfig {
  return keybindings.filter((binding) => !commands.includes(binding.command));
}

/**
 * What a key bound to `rightPanel.close` and a thread rule does: close the panel tab, else settle
 * or archive. `close` marks a close key, whose settle never un-settles. Both are tried because the
 * old Avi Code's keybindings.json binds mod+w to the archive under `!terminalFocus` alone.
 */
export function closeThreadSteps(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: Partial<ShortcutMatchContext>,
): { readonly close: boolean; readonly fallback: "settle" | "archive" | null } {
  const resolve = (...excluded: ReadonlyArray<KeybindingCommand>) =>
    resolveShortcutCommand(event, withoutCommand(keybindings, ...excluded), { context });
  const shadowed = resolve("rightPanel.close");
  return {
    close: resolve("thread.settle", "thread.archive") === "rightPanel.close",
    fallback:
      shadowed === "thread.settle" ? "settle" : shadowed === "thread.archive" ? "archive" : null,
  };
}

/**
 * What `view.reopenClosed` or `thread.reopenLastArchived` reopens: a closed tab or view while one
 * is left, then the last settled thread or the last archived one. `ReopenClosedViewShortcut`
 * resolves without `thread.reopenLastArchived` rules to agree with this.
 */
export function resolveReopenTarget(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: Partial<ShortcutMatchContext>,
  closedViewCount: number,
): "closed-view" | "settled-thread" | "archived-thread" | null {
  const command = resolveShortcutCommand(event, keybindings, { context });
  if (command !== "view.reopenClosed" && command !== "thread.reopenLastArchived") return null;
  const closedView = resolveShortcutCommand(
    event,
    withoutCommand(keybindings, "thread.reopenLastArchived"),
    { context },
  );
  if (closedViewCount > 0 && closedView === "view.reopenClosed") return "closed-view";
  return command === "thread.reopenLastArchived" ? "archived-thread" : "settled-thread";
}

type SettledThreadCandidate = Pick<
  EnvironmentThreadShell,
  "environmentId" | "id" | "lineage" | "archivedAt" | "settledOverride" | "settledAt"
>;

/**
 * The listed, unarchived thread settled most recently, skipping `reopened` settlings a shell
 * may still show. Keyed like `pickLastArchivedThread`, so a thread settled again is new.
 */
export function pickLastSettledThread(
  threads: ReadonlyArray<SettledThreadCandidate>,
  reopened: ReadonlySet<string>,
): LastArchivedThread | null {
  let best: { at: number; id: string; result: LastArchivedThread } | null = null;
  for (const thread of threads) {
    if (thread.settledOverride !== "settled" || thread.settledAt === null) continue;
    if (thread.archivedAt !== null || !isListedThreadLineage(thread.lineage)) continue;
    const at = Date.parse(thread.settledAt);
    const ref = scopeThreadRef(thread.environmentId, thread.id);
    const archiveKey = `${scopedThreadKey(ref)}@${at}`;
    if (reopened.has(archiveKey)) continue;
    if (best === null || at > best.at || (at === best.at && thread.id > best.id)) {
      best = { at, id: thread.id, result: { ref, archiveKey } };
    }
  }
  return best?.result ?? null;
}

export interface ArchivedThreads {
  readonly environmentId: EnvironmentId;
  readonly threads: ReadonlyArray<
    Pick<OrchestrationV2ThreadShell, "id" | "lineage" | "archivedAt" | "createdAt">
  >;
}

export interface LastArchivedThread {
  readonly ref: ScopedThreadRef;
  /** Identifies this archiving, so a thread archived again later is a new candidate. */
  readonly archiveKey: string;
}

/**
 * The listed thread archived most recently, skipping `reopened` archivings a snapshot may
 * still show. Subagents and side chats come back with their parent, so they are not picked.
 */
export function pickLastArchivedThread(
  archives: ReadonlyArray<ArchivedThreads>,
  reopened: ReadonlySet<string>,
): LastArchivedThread | null {
  let best: { at: number; id: string; result: LastArchivedThread } | null = null;
  for (const { environmentId, threads } of archives) {
    for (const thread of threads) {
      if (!isListedThreadLineage(thread.lineage)) continue;
      const at = DateTime.toEpochMillis(thread.archivedAt ?? thread.createdAt);
      const ref = scopeThreadRef(environmentId, thread.id);
      const archiveKey = `${scopedThreadKey(ref)}@${at}`;
      if (reopened.has(archiveKey)) continue;
      if (best === null || at > best.at || (at === best.at && thread.id > best.id)) {
        best = { at, id: thread.id, result: { ref, archiveKey } };
      }
    }
  }
  return best?.result ?? null;
}
