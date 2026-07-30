import React, { memo, useCallback, useMemo } from "react";
import type { SidebarThreadSortOrder } from "@t3tools/contracts/settings";
import {
  scopedThreadKey,
  scopeProjectRef,
  scopeThreadRef,
} from "@t3tools/client-runtime/environment";
import { settlePromise, squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";

import { useOpenPrLink } from "../../lib/openPullRequestLink";
import { readLocalApi } from "../../localApi";
import type { SidebarThreadSummary } from "../../types";
import type { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import type {
  SidebarProjectGroupMember,
  SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { buildFlatSidebarThreadList } from "../Sidebar.logic";
import { useUiStateStore } from "../../uiStateStore";
import { stackedThreadToast, toastManager } from "../ui/toast";
import {
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "../ui/sidebar";
import { SidebarThreadRow } from "./SidebarThreadRow";
import type { SidebarThreadHandlers } from "./useSidebarThreadHandlers";

/** Avi Code addition: the sidebar's flat mode.
 *
 * Every non-archived thread across every project in one list, ordered by the
 * same `sidebarThreadSortOrder` the tree applies within a project. The point is
 * that the ordering key becomes (thread) instead of (project, thread), so the
 * ctrl+1…ctrl+9 jump slots land on the globally most recent chats rather than
 * on whichever rows happen to head each expanded project. */

export interface SidebarFlatThreadListProps {
  threads: readonly SidebarThreadSummary[];
  projectIdentityByThreadKey: ReadonlyMap<
    string,
    {
      environmentId: SidebarThreadSummary["environmentId"];
      cwd: string;
      label: string;
    }
  >;
  threadSortOrder: SidebarThreadSortOrder;
  flatThreadCount: number;
  isListExpanded: boolean;
  expandList: () => void;
  collapseList: () => void;
  activeRouteThreadKey: string | null;
  threadJumpLabelByKey: ReadonlyMap<string, string>;
  threadHandlers: SidebarThreadHandlers;
  attachThreadListAutoAnimateRef: (node: HTMLElement | null) => void;
}

/** The rendered rows and their keys, shared by the list and by `Sidebar` (which
 * needs the same order for jump slots, traversal, and prewarming). */
export function resolveFlatSidebarThreads(input: {
  threads: readonly SidebarThreadSummary[];
  threadSortOrder: SidebarThreadSortOrder;
  flatThreadCount: number;
  isListExpanded: boolean;
  activeRouteThreadKey: string | null;
  pinnedThreadKeys: readonly string[];
}): {
  renderedThreads: SidebarThreadSummary[];
  orderedThreadKeys: string[];
  hasOverflowingThreads: boolean;
  hiddenThreadCount: number;
} {
  const { renderedThreads, hiddenThreads, hasOverflowingThreads } = buildFlatSidebarThreadList({
    threads: input.threads,
    sortOrder: input.threadSortOrder,
    limit: input.isListExpanded ? Number.POSITIVE_INFINITY : input.flatThreadCount,
    activeThreadKey: input.activeRouteThreadKey,
    getThreadKey: (thread) => scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    pinnedThreadKeys: input.pinnedThreadKeys,
  });
  return {
    renderedThreads,
    orderedThreadKeys: renderedThreads.map((thread) =>
      scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id)),
    ),
    hasOverflowingThreads,
    hiddenThreadCount: hiddenThreads.length,
  };
}

export const SidebarFlatThreadList = memo(function SidebarFlatThreadList(
  props: SidebarFlatThreadListProps,
) {
  const {
    activeRouteThreadKey,
    attachThreadListAutoAnimateRef,
    collapseList,
    expandList,
    flatThreadCount,
    isListExpanded,
    projectIdentityByThreadKey,
    threadHandlers,
    threadJumpLabelByKey,
    threadSortOrder,
    threads,
  } = props;
  const openPrLink = useOpenPrLink();
  // Avi Code addition: pinned rows head the flat list too.
  const pinnedThreadKeys = useUiStateStore((state) => state.pinnedThreadKeys);

  const { renderedThreads, orderedThreadKeys, hasOverflowingThreads, hiddenThreadCount } = useMemo(
    () =>
      resolveFlatSidebarThreads({
        threads,
        threadSortOrder,
        flatThreadCount,
        isListExpanded,
        activeRouteThreadKey,
        pinnedThreadKeys,
      }),
    [
      activeRouteThreadKey,
      flatThreadCount,
      isListExpanded,
      pinnedThreadKeys,
      threadSortOrder,
      threads,
    ],
  );

  const showMoreButtonRender = useMemo(() => <button type="button" />, []);
  const showLessButtonRender = useMemo(() => <button type="button" />, []);

  return (
    <SidebarMenuSub
      ref={attachThreadListAutoAnimateRef}
      className="mx-0.5 my-0 w-full translate-x-0 gap-0.5 overflow-hidden border-l-0 px-1 py-0 sm:mx-1 sm:px-1.5"
    >
      {renderedThreads.length === 0 ? (
        <SidebarMenuSubItem className="w-full" data-thread-selection-safe>
          <div
            data-thread-selection-safe
            className="flex h-8 w-full translate-x-0 items-center px-2 text-left text-xs text-sidebar-muted-foreground/75"
          >
            <span>No threads yet</span>
          </div>
        </SidebarMenuSubItem>
      ) : null}
      {renderedThreads.map((thread) => {
        const threadKey = scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
        return (
          <SidebarThreadRow
            key={threadKey}
            thread={thread}
            projectCwd={null}
            projectIdentity={projectIdentityByThreadKey.get(threadKey) ?? null}
            orderedProjectThreadKeys={orderedThreadKeys}
            isActive={activeRouteThreadKey === threadKey}
            jumpLabel={threadJumpLabelByKey.get(threadKey) ?? null}
            appSettingsConfirmThreadArchive={threadHandlers.appSettingsConfirmThreadArchive}
            renamingThreadKey={threadHandlers.renamingThreadKey}
            renamingTitle={threadHandlers.renamingTitle}
            setRenamingTitle={threadHandlers.setRenamingTitle}
            startThreadRename={threadHandlers.startThreadRename}
            renamingInputRef={threadHandlers.renamingInputRef}
            renamingCommittedRef={threadHandlers.renamingCommittedRef}
            confirmingArchiveThreadKey={threadHandlers.confirmingArchiveThreadKey}
            setConfirmingArchiveThreadKey={threadHandlers.setConfirmingArchiveThreadKey}
            confirmArchiveButtonRefs={threadHandlers.confirmArchiveButtonRefs}
            handleThreadClick={threadHandlers.handleThreadClick}
            navigateToThread={threadHandlers.navigateToThread}
            handleMultiSelectContextMenu={threadHandlers.handleMultiSelectContextMenu}
            handleThreadContextMenu={threadHandlers.handleThreadContextMenu}
            clearSelection={threadHandlers.clearSelection}
            commitRename={threadHandlers.commitRename}
            cancelRename={threadHandlers.cancelRename}
            attemptArchiveThread={threadHandlers.attemptArchiveThread}
            openPrLink={openPrLink}
          />
        );
      })}

      {hasOverflowingThreads && !isListExpanded ? (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showMoreButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-8 w-full translate-x-0 justify-start px-2 text-left text-xs text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            onClick={expandList}
          >
            <span>Show {hiddenThreadCount} more</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
      {hasOverflowingThreads && isListExpanded ? (
        <SidebarMenuSubItem className="w-full">
          <SidebarMenuSubButton
            render={showLessButtonRender}
            data-thread-selection-safe
            size="sm"
            className="h-8 w-full translate-x-0 justify-start px-2 text-left text-xs text-sidebar-muted-foreground/75 hover:bg-sidebar-row-hover hover:text-sidebar-foreground"
            onClick={collapseList}
          >
            <span>Show less</span>
          </SidebarMenuSubButton>
        </SidebarMenuSubItem>
      ) : null}
    </SidebarMenuSub>
  );
});

/** "New thread" for the flat list. There is no project header to hang the
 * button off, so it asks which project first (skipping the prompt when there
 * is only one). */
export function useFlatNewThread(
  projects: readonly SidebarProjectSnapshot[],
  handleNewThread: ReturnType<typeof useNewThreadHandler>,
) {
  const { isMobile, setOpenMobile } = useSidebar();
  const members = useMemo(() => projects.flatMap((project) => project.memberProjects), [projects]);

  const createInProject = useCallback(
    (member: SidebarProjectGroupMember) => {
      if (isMobile) {
        setOpenMobile(false);
      }
      void (async () => {
        // No options: branch, worktree, and env mode come from the user's
        // configured defaults, never from the currently viewed thread.
        const result = await settlePromise(() =>
          handleNewThread(scopeProjectRef(member.environmentId, member.id)),
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
      })();
    },
    [handleNewThread, isMobile, setOpenMobile],
  );

  return useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
      if (members.length === 0) return;
      if (members.length === 1) {
        createInProject(members[0]!);
        return;
      }
      void (async () => {
        const api = readLocalApi();
        if (!api) return;
        const clicked = await api.contextMenu.show(
          members.map((member) => ({
            id: member.physicalProjectKey,
            label: member.environmentLabel
              ? `${member.title} — ${member.environmentLabel}`
              : member.title,
          })),
          { x: event.clientX, y: event.clientY },
        );
        if (!clicked) return;
        const target = members.find((member) => member.physicalProjectKey === clicked);
        if (!target) return;
        createInProject(target);
      })();
    },
    [createInProject, members],
  );
}
