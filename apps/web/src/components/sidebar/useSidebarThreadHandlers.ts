import React, { useCallback, useMemo, useRef, useState } from "react";
import type { ScopedThreadRef, ThreadId } from "@t3tools/contracts";
import {
  parseScopedThreadKey,
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { useRouter } from "@tanstack/react-router";

import { isMacPlatform } from "../../lib/utils";
import { readLocalApi } from "../../localApi";
import { readProject, readThreadShell } from "../../state/entities";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";
import { useUiStateStore } from "../../uiStateStore";
import { useThreadSelectionStore } from "../../threadSelectionStore";
import { buildThreadRouteParams } from "../../threadRoutes";
import { useCopyToClipboard } from "../../hooks/useCopyToClipboard";
import { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import { useThreadActions } from "../../hooks/useThreadActions";
import { useClientSettings } from "../../hooks/useSettings";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { useSidebar } from "../ui/sidebar";
import {
  archiveSelectedThreadEntries,
  buildMultiSelectThreadContextMenuItems,
  isTrailingDoubleClick,
} from "../Sidebar.logic";

/** Every thread-row interaction in the sidebar: navigation, multi-select,
 * inline rename, archive confirmation, and both context menus.
 *
 * Avi Code addition. This was inline in `SidebarProjectItem`, which meant a row
 * could only exist inside a project subtree. The flat sidebar renders the same
 * `SidebarThreadRow` with no owning project, so the logic moved here. Nothing
 * in it was actually project-scoped: thread and project records are read from
 * the entity store by the row's own refs, so a row resolves its own workspace
 * path rather than borrowing the enclosing project's. */
export function useSidebarThreadHandlers() {
  const router = useRouter();
  const { isMobile, setOpenMobile } = useSidebar();
  const { archiveThread, unarchiveThread, deleteThread } = useThreadActions();
  const handleNewThread = useNewThreadHandler();
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });
  const markThreadUnread = useUiStateStore((state) => state.markThreadUnread);
  // Avi Code addition: pinned threads.
  const setThreadPinned = useUiStateStore((state) => state.setThreadPinned);
  const toggleThreadSelection = useThreadSelectionStore((state) => state.toggleThread);
  const rangeSelectTo = useThreadSelectionStore((state) => state.rangeSelectTo);
  const clearSelection = useThreadSelectionStore((state) => state.clearSelection);
  const removeFromSelection = useThreadSelectionStore((state) => state.removeFromSelection);
  const setSelectionAnchor = useThreadSelectionStore((state) => state.setAnchor);
  const appSettingsConfirmThreadDelete = useClientSettings<boolean>(
    (settings) => settings.confirmThreadDelete,
  );
  const appSettingsConfirmThreadArchive = useClientSettings<boolean>(
    (settings) => settings.confirmThreadArchive,
  );

  const [renamingThreadKey, setRenamingThreadKey] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState("");
  const [confirmingArchiveThreadKey, setConfirmingArchiveThreadKey] = useState<string | null>(null);
  const renamingCommittedRef = useRef(false);
  const renamingInputRef = useRef<HTMLInputElement | null>(null);
  const confirmArchiveButtonRefs = useRef(new Map<string, HTMLButtonElement>());

  const { copyToClipboard: copyThreadIdToClipboard } = useCopyToClipboard<{
    threadId: ThreadId;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Thread ID copied",
        description: ctx.threadId,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy thread ID",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });
  const { copyToClipboard: copyPathToClipboard } = useCopyToClipboard<{
    path: string;
  }>({
    onCopy: (ctx) => {
      toastManager.add({
        type: "success",
        title: "Path copied",
        description: ctx.path,
      });
    },
    onError: (error) => {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to copy path",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
  });

  const navigateToThread = useCallback(
    (threadRef: ScopedThreadRef) => {
      if (useThreadSelectionStore.getState().selectedThreadKeys.size > 0) {
        clearSelection();
      }
      setSelectionAnchor(scopedThreadKey(threadRef));
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [clearSelection, isMobile, router, setOpenMobile, setSelectionAnchor],
  );

  const handleThreadClick = useCallback(
    (
      event: React.MouseEvent,
      threadRef: ScopedThreadRef,
      orderedProjectThreadKeys: readonly string[],
    ) => {
      const isMac = isMacPlatform(navigator.platform);
      const isModClick = isMac ? event.metaKey : event.ctrlKey;
      const isShiftClick = event.shiftKey;
      const threadKey = scopedThreadKey(threadRef);
      const currentSelectionCount = useThreadSelectionStore.getState().selectedThreadKeys.size;

      if (isModClick) {
        event.preventDefault();
        toggleThreadSelection(threadKey);
        return;
      }

      if (isShiftClick) {
        event.preventDefault();
        rangeSelectTo(threadKey, orderedProjectThreadKeys);
        return;
      }

      // Ignore the trailing click of a plain double-click so it doesn't navigate
      // while a double-click is starting an inline rename. Placed after the
      // modifier branches so cmd/shift selection still processes every click.
      if (isTrailingDoubleClick(event.detail)) {
        return;
      }

      if (currentSelectionCount > 0) {
        clearSelection();
      }
      setSelectionAnchor(threadKey);
      if (isMobile) {
        setOpenMobile(false);
      }
      void router.navigate({
        to: "/$environmentId/$threadId",
        params: buildThreadRouteParams(threadRef),
      });
    },
    [
      clearSelection,
      isMobile,
      rangeSelectTo,
      router,
      setOpenMobile,
      setSelectionAnchor,
      toggleThreadSelection,
    ],
  );

  const attemptArchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await archiveThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to archive thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
        return;
      }
      // Avi Code addition: an archived thread leaves the list, so its pin goes
      // with it. Unarchiving deliberately does not restore the pin.
      setThreadPinned(scopedThreadKey(threadRef), false);
    },
    [archiveThread, setThreadPinned],
  );

  const handleUnarchiveThread = useCallback(
    async (threadRef: ScopedThreadRef) => {
      const result = await unarchiveThread(threadRef);
      if (result._tag === "Success" || isAtomCommandInterrupted(result)) {
        return;
      }
      const error = squashAtomCommandFailure(result);
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: "Failed to unarchive thread",
          description: error instanceof Error ? error.message : "An error occurred.",
        }),
      );
    },
    [unarchiveThread],
  );

  const cancelRename = useCallback(() => {
    setRenamingThreadKey(null);
    renamingInputRef.current = null;
  }, []);

  const startThreadRename = useCallback((threadKey: string, title: string) => {
    setRenamingThreadKey(threadKey);
    setRenamingTitle(title);
    renamingCommittedRef.current = false;
  }, []);

  const commitRename = useCallback(
    async (threadRef: ScopedThreadRef, newTitle: string, originalTitle: string) => {
      const threadKey = scopedThreadKey(threadRef);
      const finishRename = () => {
        setRenamingThreadKey((current) => {
          if (current !== threadKey) return current;
          renamingInputRef.current = null;
          return null;
        });
      };

      const trimmed = newTitle.trim();
      if (trimmed.length === 0) {
        toastManager.add({
          type: "warning",
          title: "Thread title cannot be empty",
        });
        finishRename();
        return;
      }
      if (trimmed === originalTitle) {
        finishRename();
        return;
      }
      const result = await updateThreadMetadata({
        environmentId: threadRef.environmentId,
        input: {
          threadId: threadRef.threadId,
          title: trimmed,
        },
      });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to rename thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      finishRename();
    },
    [updateThreadMetadata],
  );

  const handleMultiSelectContextMenu = useCallback(
    async (position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKeys = [...useThreadSelectionStore.getState().selectedThreadKeys];
      if (threadKeys.length === 0) return;
      const count = threadKeys.length;
      const selectedThreadEntries = threadKeys.flatMap((threadKey) => {
        const threadRef = parseScopedThreadKey(threadKey);
        const thread = threadRef ? readThreadShell(threadRef) : null;
        return threadRef && thread ? [{ threadKey, threadRef, thread }] : [];
      });
      const hasRunningThread = selectedThreadEntries.some(
        ({ thread }) => thread.session?.status === "running" && thread.session.activeTurnId != null,
      );

      const clicked = await api.contextMenu.show(
        buildMultiSelectThreadContextMenuItems({ count, hasRunningThread }),
        position,
      );

      if (clicked === "mark-unread") {
        for (const { threadKey, thread } of selectedThreadEntries) {
          markThreadUnread(threadKey, thread.latestTurn?.completedAt);
        }
        clearSelection();
        return;
      }

      if (clicked === "archive") {
        if (appSettingsConfirmThreadArchive) {
          const confirmed = await api.dialogs.confirm(
            `Archive ${count} thread${count === 1 ? "" : "s"}?`,
          );
          if (!confirmed) return;
        }

        const archiveOutcome = await archiveSelectedThreadEntries({
          entries: selectedThreadEntries,
          archive: ({ threadRef }, onArchived) => archiveThread(threadRef, { onArchived }),
        });
        for (const failure of archiveOutcome.followupFailures) {
          if (isAtomCommandInterrupted(failure)) continue;
          const error = squashAtomCommandFailure(failure);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Thread archived, but navigation failed",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        // Avi Code addition: unpin whatever actually archived, including the
        // partial set when a later thread in the batch failed.
        setThreadPinned(archiveOutcome.archivedThreadKeys, false);
        if (archiveOutcome.mutationFailure) {
          removeFromSelection(archiveOutcome.archivedThreadKeys);
          if (!isAtomCommandInterrupted(archiveOutcome.mutationFailure)) {
            const error = squashAtomCommandFailure(archiveOutcome.mutationFailure);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to archive threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        removeFromSelection(threadKeys);
        return;
      }

      if (clicked !== "delete") return;

      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete ${count} thread${count === 1 ? "" : "s"}?`,
            "This permanently clears conversation history for these threads.",
          ].join("\n"),
        );
        if (!confirmed) return;
      }

      const deletedThreadKeys = new Set(threadKeys);
      for (const { threadKey, threadRef } of selectedThreadEntries) {
        const result = await deleteThread(threadRef, {
          deletedThreadKeys,
        });
        if (result._tag === "Failure") {
          if (!isAtomCommandInterrupted(result)) {
            const error = squashAtomCommandFailure(result);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Failed to delete threads",
                description: error instanceof Error ? error.message : "An error occurred.",
              }),
            );
          }
          return;
        }
        // Avi Code addition: unpin as each delete lands, so an aborted batch
        // leaves no pins pointing at threads that are already gone.
        setThreadPinned(threadKey, false);
      }
      removeFromSelection(threadKeys);
    },
    [
      appSettingsConfirmThreadArchive,
      appSettingsConfirmThreadDelete,
      archiveThread,
      clearSelection,
      deleteThread,
      markThreadUnread,
      removeFromSelection,
      setThreadPinned,
    ],
  );

  const handleThreadContextMenu = useCallback(
    async (threadRef: ScopedThreadRef, position: { x: number; y: number }) => {
      const api = readLocalApi();
      if (!api) return;
      const threadKey = scopedThreadKey(threadRef);
      const thread = readThreadShell(threadRef);
      if (!thread) return;
      // Resolve the path from the thread's own project rather than an enclosing
      // one: grouped projects can span environments, and the flat list has no
      // enclosing project at all.
      const threadProject = readProject(scopeProjectRef(thread.environmentId, thread.projectId));
      const threadWorkspacePath = thread.worktreePath ?? threadProject?.workspaceRoot ?? null;
      // Avi Code addition: read at menu-open time so the label matches the
      // current state without making the whole menu depend on the pin list.
      const isThreadPinned = useUiStateStore.getState().pinnedThreadKeys.includes(threadKey);
      const clicked = await api.contextMenu.show(
        [
          ...(thread.branch
            ? [{ id: "new-thread-on-branch", label: `New thread on ${thread.branch}` }]
            : []),
          { id: "toggle-pin", label: isThreadPinned ? "Unpin thread" : "Pin thread" },
          { id: "rename", label: "Rename thread" },
          { id: "mark-unread", label: "Mark unread" },
          { id: "copy-path", label: "Copy Path" },
          { id: "copy-thread-id", label: "Copy Thread ID" },
          { id: "delete", label: "Delete", destructive: true, icon: "trash" },
        ],
        position,
      );

      if (clicked === "new-thread-on-branch") {
        // Explicit branch carry-over: reuse the thread's worktree when it
        // has one, otherwise its branch on the local checkout.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(thread.environmentId, thread.projectId), {
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            envMode: thread.worktreePath ? "worktree" : "local",
            startFromOrigin: false,
          }),
        );
        if (result._tag === "Failure") {
          const error = squashAtomCommandFailure(result);
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Could not create thread",
              description: error instanceof Error ? error.message : "An error occurred.",
            }),
          );
        }
        return;
      }

      if (clicked === "toggle-pin") {
        setThreadPinned(threadKey, !isThreadPinned);
        return;
      }

      if (clicked === "rename") {
        startThreadRename(threadKey, thread.title);
        return;
      }

      if (clicked === "mark-unread") {
        markThreadUnread(threadKey, thread.latestTurn?.completedAt);
        return;
      }
      if (clicked === "copy-path") {
        if (!threadWorkspacePath) {
          toastManager.add(
            stackedThreadToast({
              type: "error",
              title: "Path unavailable",
              description: "This thread does not have a workspace path to copy.",
            }),
          );
          return;
        }
        copyPathToClipboard(threadWorkspacePath, { path: threadWorkspacePath });
        return;
      }
      if (clicked === "copy-thread-id") {
        copyThreadIdToClipboard(thread.id, { threadId: thread.id });
        return;
      }
      if (clicked !== "delete") return;
      if (appSettingsConfirmThreadDelete) {
        const confirmed = await api.dialogs.confirm(
          [
            `Delete thread "${thread.title}"?`,
            "This permanently clears conversation history for this thread.",
          ].join("\n"),
        );
        if (!confirmed) {
          return;
        }
      }
      const result = await deleteThread(threadRef);
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to delete thread",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
        return;
      }
      // Avi Code addition: drop the pin along with the thread.
      setThreadPinned(threadKey, false);
    },
    [
      appSettingsConfirmThreadDelete,
      copyPathToClipboard,
      copyThreadIdToClipboard,
      deleteThread,
      handleNewThread,
      markThreadUnread,
      setThreadPinned,
      startThreadRename,
    ],
  );

  // Memoized because `SidebarProjectsContent` and `SidebarFlatThreadList` are
  // memo()'d and take this whole object as one prop — a fresh literal every
  // render would make both memos useless. Refs and setState functions are
  // already stable, so the identity only turns over on a real state change.
  return useMemo(
    () => ({
      appSettingsConfirmThreadArchive,
      attemptArchiveThread,
      cancelRename,
      clearSelection,
      commitRename,
      confirmArchiveButtonRefs,
      confirmingArchiveThreadKey,
      copyPathToClipboard,
      handleMultiSelectContextMenu,
      handleThreadClick,
      handleThreadContextMenu,
      handleUnarchiveThread,
      navigateToThread,
      renamingCommittedRef,
      renamingInputRef,
      renamingThreadKey,
      renamingTitle,
      setConfirmingArchiveThreadKey,
      setRenamingTitle,
      startThreadRename,
    }),
    [
      appSettingsConfirmThreadArchive,
      attemptArchiveThread,
      cancelRename,
      clearSelection,
      commitRename,
      confirmingArchiveThreadKey,
      copyPathToClipboard,
      handleMultiSelectContextMenu,
      handleThreadClick,
      handleThreadContextMenu,
      handleUnarchiveThread,
      navigateToThread,
      renamingThreadKey,
      renamingTitle,
      startThreadRename,
    ],
  );
}

export type SidebarThreadHandlers = ReturnType<typeof useSidebarThreadHandlers>;
