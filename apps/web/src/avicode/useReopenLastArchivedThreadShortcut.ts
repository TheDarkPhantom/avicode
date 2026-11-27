import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as ThreadUndo from "@t3tools/client-runtime/state/thread-undo";
import type { ResolvedKeybindingsConfig } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "gt-react";
import { useEffect, useEffectEvent, useRef } from "react";

import { isCommandPaletteOpen } from "../commandPaletteBus";
import { useClosedViewStore } from "../closedViewStore";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { refreshArchivedThreadsForEnvironment } from "../lib/archivedThreadsState";
import { m } from "../i18n/messages";
import { isEditableFocused } from "../lib/editableFocus";
import { isPreviewFocused } from "../lib/previewFocus";
import { isTerminalFocused } from "../lib/terminalFocus";
import { isModelPickerOpen } from "../modelPickerVisibility";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { readProjects, readThreadShells } from "../state/entities";
import { orchestrationEnvironment } from "../state/orchestration";
import { environmentShell } from "../state/shell";
import { threadEnvironment } from "../state/threads";
import { useAtomQueryRunner } from "../state/use-atom-query-runner";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { buildThreadRouteParams } from "../threadRoutes";
import {
  type ArchivedThreads,
  pickLastArchivedThread,
  pickLastSettledThread,
  resolveReopenTarget,
} from "./threadCloseReopen";

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
  const navigate = useNavigate();
  // useThreadActions().unarchiveThread does the same, but carries its many hooks into the root.
  const unarchive = useOrchestrationCommand(threadEnvironment.unarchive, { reportFailure: false });
  const unsettle = useOrchestrationCommand(threadEnvironment.unsettle, { reportFailure: false });
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
    const { ref } = last;
    ThreadUndo.invalidate("archive", scopedThreadKey(ref));
    const result = await unarchive({
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId },
    });
    if (result._tag === "Success") {
      refreshArchivedThreadsForEnvironment(ref.environmentId);
      await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      return;
    }
    reopened.current.delete(last.archiveKey);
    if (isAtomCommandInterrupted(result)) return;
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: m(msg("Failed to unarchive thread")),
        description:
          thrownErrorMessage(squashAtomCommandFailure(result), m) ?? m(msg("An error occurred.")),
      }),
    );
  });

  const reunsettled = useRef(new Set<string>());
  const unsettleLast = useEffectEvent(async () => {
    const last = pickLastSettledThread(readThreadShells(), reunsettled.current);
    if (!last) return;
    reunsettled.current.add(last.archiveKey);
    const { ref } = last;
    ThreadUndo.invalidate("settle", scopedThreadKey(ref));
    const result = await unsettle({
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId, reason: "user" },
    });
    if (result._tag === "Success") {
      await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      return;
    }
    reunsettled.current.delete(last.archiveKey);
    if (isAtomCommandInterrupted(result)) return;
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: m(msg("Failed to un-settle thread")),
        description:
          thrownErrorMessage(squashAtomCommandFailure(result), m) ?? m(msg("An error occurred.")),
      }),
    );
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
