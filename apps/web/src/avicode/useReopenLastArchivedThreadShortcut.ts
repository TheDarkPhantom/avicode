import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useEffect, useEffectEvent, useRef } from "react";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { useClosedViewStore } from "../closedViewStore";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects, readThreadShells } from "../state/entities";
import { orchestrationEnvironment } from "../state/orchestration";
import { environmentShell } from "../state/shell";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import {
  type ArchivedThreads,
  pickLastArchivedThread,
  pickLastSettledThread,
  resolveReopenTarget,
} from "./threadCloseReopen";
import { useUnarchiveAndOpenThread } from "./useUnarchiveAndOpenThread";
import { useUnsettleAndOpenThread } from "./useUnsettleAndOpenThread";

/**
 * Once no closed tab or view is left (see `resolveReopenTarget`), `view.reopenClosed`
 * un-settles and opens the most recently settled thread, and `thread.reopenLastArchived`
 * unarchives and opens the most recently archived one. Each press reads them fresh, so repeated
 * presses walk back through them.
 */
export function useReopenLastArchivedThreadShortcut(input: {
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly terminalOpen: boolean;
  readonly previewOpen: boolean;
}) {
  const { keybindings, terminalOpen, previewOpen } = input;
  const unarchiveAndOpen = useUnarchiveAndOpenThread();
  const unsettleAndOpen = useUnsettleAndOpenThread();
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

  const reunsettled = useRef(new Set<string>());
  const unsettleLast = useEffectEvent(async () => {
    const last = pickLastSettledThread(readThreadShells(), reunsettled.current);
    if (!last) return;
    reunsettled.current.add(last.archiveKey);
    if (!(await unsettleAndOpen(last.ref))) reunsettled.current.delete(last.archiveKey);
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
      const target = resolveReopenTarget(event, keybindings, context, closedViewCount);
      if (target !== "archived-thread" && target !== "settled-thread") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      const reopen = target === "archived-thread" ? reopenNext : unsettleLast;
      pending.current = pending.current.then(() => reopen()).catch(() => undefined);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [keybindings, previewOpen, terminalOpen]);
}
