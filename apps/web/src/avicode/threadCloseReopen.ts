import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
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

/** The keybindings with one command's rules left out, so a rule it shadows can win. */
export function withoutCommand(
  keybindings: ResolvedKeybindingsConfig,
  command: KeybindingCommand,
): ResolvedKeybindingsConfig {
  return keybindings.filter((binding) => binding.command !== command);
}

/**
 * What a key bound to `rightPanel.close`, `thread.archive` or both may do, in order: close the
 * panel tab, and failing that archive the thread. The old Avi Code's keybindings.json, which the
 * first start copies, binds mod+w to the archive under `!terminalFocus` alone, so whichever rule
 * wins the key both are tried.
 */
export function closeOrArchiveSteps(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: Partial<ShortcutMatchContext>,
): { readonly close: boolean; readonly archive: boolean } {
  const resolve = (excluded: KeybindingCommand) =>
    resolveShortcutCommand(event, withoutCommand(keybindings, excluded), { context });
  return {
    close: resolve("thread.archive") === "rightPanel.close",
    archive: resolve("rightPanel.close") === "thread.archive",
  };
}

/**
 * What a key that resolves to `view.reopenClosed` or `thread.reopenLastArchived` reopens: a
 * closed tab or view while one is left and the key is bound to that, else the last archived
 * thread. The closed-view half runs in `ReopenClosedViewShortcut`, which resolves with
 * `withoutCommand(keybindings, "thread.reopenLastArchived")` to agree with this.
 */
export function resolveReopenTarget(
  event: ShortcutEventLike,
  keybindings: ResolvedKeybindingsConfig,
  context: Partial<ShortcutMatchContext>,
  closedViewCount: number,
): "closed-view" | "archived-thread" | null {
  const command = resolveShortcutCommand(event, keybindings, { context });
  if (command !== "view.reopenClosed" && command !== "thread.reopenLastArchived") return null;
  const closedView = resolveShortcutCommand(
    event,
    withoutCommand(keybindings, "thread.reopenLastArchived"),
    { context },
  );
  return closedViewCount > 0 && closedView === "view.reopenClosed"
    ? "closed-view"
    : "archived-thread";
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
