import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { useClosedViewStore } from "../closedViewStore";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects } from "../state/entities";
import { orchestrationEnvironment } from "../state/orchestration";
import { environmentShell } from "../state/shell";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import {
  type ArchivedThreads,
  pickLastArchivedThread,
  resolveReopenTarget,
} from "./threadCloseReopen";
import { useUnarchiveAndOpenThread } from "./useUnarchiveAndOpenThread";

/**
 * Unarchives and opens the most recently archived thread for `thread.reopenLastArchived`, and
 * for `view.reopenClosed` once no closed tab or view is left (see `resolveReopenTarget`). Each
 * press reads the archive fresh, so repeated presses walk back through it.
 */
export function useReopenLastArchivedThreadShortcut(input: {
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly terminalOpen: boolean;
  readonly previewOpen: boolean;
}) {
  const { keybindings, terminalOpen, previewOpen } = input;
  const unarchiveAndOpen = useUnarchiveAndOpenThread();
  const loadArchived = useAtomQueryRunner(orchestrationEnvironment.archivedShellSnapshot, {
    reportFailure: false,
    refresh: true,
  });
  const pending = useRef(Promise.resolve());
  // A snapshot can trail the unarchive, so a quick second press must not pick the same thread.
  const reopened = useRef(new Set<string>());

  const reopenNext = useEffectEvent(async () => {
    const environmentIds = new Set(readProjects().map((project) => project.environmentId));
    const archives: ArchivedThreads[] = [];
    await Promise.all(
      [...environmentIds]
        .filter(
          (environmentId) =>
            appAtomRegistry.get(environmentShell.stateValueAtom(environmentId)).status === "live",
        )
        .map(async (environmentId) => {
          const result = await loadArchived({ environmentId, input: {} });
          if (result._tag === "Success") {
            archives.push({ environmentId, threads: result.value.threads });
          }
        }),
    );
    const last = pickLastArchivedThread(archives, reopened.current);
    if (!last) return;
    reopened.current.add(last.archiveKey);
    if (!(await unarchiveAndOpen(last.ref))) reopened.current.delete(last.archiveKey);
  });

  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- subscribes to window keydown for the reopen-archived-thread shortcut
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        isCommandPaletteOpen() ||
        (event.target instanceof HTMLElement && event.target.closest("[data-keybinding-capture]"))
      )
        return;
      const context = {
        terminalFocus: isTerminalFocused(),
        terminalOpen,
        previewFocus: isPreviewFocused(),
        previewOpen,
        editableFocus: isEditableFocused(event.target),
        modelPickerOpen: isModelPickerOpen(),
      };
      const closedViewCount = useClosedViewStore.getState().entries.length;
      if (resolveReopenTarget(event, keybindings, context, closedViewCount) !== "archived-thread") {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      pending.current = pending.current.then(() => reopenNext()).catch(() => undefined);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, previewOpen, terminalOpen]);
}
