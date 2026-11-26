import type { ContextMenuSource } from "@t3tools/contracts";
import { settlePromise } from "@t3tools/client-runtime/state/runtime";
import { msg, useGT, useMessages } from "gt-react";
import { ChevronDownIcon, EllipsisIcon, FolderIcon } from "lucide-react";
import { memo, useState, type DragEvent } from "react";

import { Button } from "~/components/ui/button";
import { contextMenuSourceOf } from "~/contextMenuSource";
import { readLocalApi } from "~/localApi";
import { cn } from "~/lib/utils";
import type { SidebarFolderDot } from "./sidebarFolderLayout";
import { type SidebarFolder, sidebarFolderActions, useSidebarFoldersStore } from "./sidebarFolders";
import { openSidebarFolderNameDialog } from "./sidebarFolderNameDialogStore";

// Chromium lowercases custom drag types, and file drop zones only react to "Files".
const FOLDER_DRAG_TYPE = "application/x-avicode-sidebar-folder";

const DOT_CLASS_NAME = {
  attention: "bg-warning",
  failed: "bg-error",
  unread: "bg-success",
  working: "bg-info",
} as const;

const DOT_LABEL = {
  attention: msg(", needs you", { $context: "project folder status, read after its name" }),
  failed: msg(", failed", { $context: "project folder status, read after its name" }),
  unread: msg(", done", { $context: "project folder status, read after its name" }),
  working: msg(", working", { $context: "project folder status, read after its name" }),
} as const;

function isFolderDrag(event: DragEvent) {
  return event.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
}

async function showFolderMenu(
  folder: SidebarFolder,
  position: { x: number; y: number },
  source: ContextMenuSource,
  gt: ReturnType<typeof useGT>,
) {
  const api = readLocalApi();
  if (!api) return;
  const clicked = await settlePromise(() =>
    api.contextMenu.show(
      [
        { id: "rename", label: gt("Rename folder…") },
        { id: "hide", label: gt("Hide folder") },
        { id: "delete", label: gt("Delete folder"), destructive: true, separatorBefore: true },
      ],
      position,
      source,
    ),
  );
  if (clicked._tag === "Failure") return;
  switch (clicked.value) {
    case "rename":
      openSidebarFolderNameDialog({ kind: "rename", folderId: folder.id, name: folder.name });
      return;
    case "hide":
      sidebarFolderActions.setHidden(folder.id, true);
      return;
    case "delete": {
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(
          [
            gt("Delete the folder {name}?", { name: folder.name }),
            gt("Its projects stay in the sidebar, outside any folder."),
          ].join("\n"),
          { variant: "destructive" },
        ),
      );
      if (confirmed._tag === "Success" && confirmed.value) sidebarFolderActions.remove(folder.id);
      return;
    }
  }
}

/**
 * A user folder above its project shelves. The header toggles collapse, its menu
 * renames, hides or deletes it, and dragging it onto another folder reorders them.
 * Closed, it shows how many threads it hides and a dot for the most urgent one.
 */
export const SidebarFolderHeader = memo(function SidebarFolderHeader(props: {
  folder: SidebarFolder;
  hiddenThreadCount: number;
  dot: SidebarFolderDot;
}) {
  const gt = useGT();
  const m = useMessages();
  const { folder, hiddenThreadCount, dot } = props;
  const [isDropTarget, setIsDropTarget] = useState(false);
  const rowId = `avicode-folder:${folder.id}`;
  const openMenu = (position: { x: number; y: number }, source: ContextMenuSource) =>
    void showFolderMenu(folder, position, source, gt);
  return (
    <li
      data-testid="avicode-sidebar-folder"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData(FOLDER_DRAG_TYPE, folder.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onDragOver={(event) => {
        if (!isFolderDrag(event)) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setIsDropTarget(true);
      }}
      onDragLeave={(event) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        setIsDropTarget(false);
      }}
      onDrop={(event) => {
        if (!isFolderDrag(event)) return;
        event.preventDefault();
        setIsDropTarget(false);
        const draggedId = event.dataTransfer.getData(FOLDER_DRAG_TYPE);
        const folders = useSidebarFoldersStore.getState().folders;
        sidebarFolderActions.move(
          draggedId,
          folders.findIndex((candidate) => candidate.id === folder.id),
        );
      }}
      className={cn(
        "group/avicode-folder relative mt-2 list-none rounded-(--control-radius) first:mt-0",
        isDropTarget && "ring-1 ring-inset ring-primary/60",
      )}
    >
      <button
        type="button"
        data-sidebar-row={rowId}
        aria-expanded={!folder.collapsed}
        onClick={() => sidebarFolderActions.setCollapsed(folder.id, !folder.collapsed)}
        onContextMenu={(event) => {
          event.preventDefault();
          openMenu({ x: event.clientX, y: event.clientY }, contextMenuSourceOf(event));
        }}
        className="flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-(--control-radius) px-(--sidebar-row-content-inset) text-left outline-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <FolderIcon aria-hidden className="size-4 shrink-0 text-sidebar-muted-foreground" />
        <span className="min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-sidebar-muted-foreground uppercase">
          {folder.name}
        </span>
        {folder.collapsed && dot ? (
          <span className={cn("size-1.5 shrink-0 rounded-full", DOT_CLASS_NAME[dot])}>
            <span className="sr-only">{m(DOT_LABEL[dot])}</span>
          </span>
        ) : null}
        {folder.collapsed && hiddenThreadCount > 0 ? (
          <span className="shrink-0 text-xs tabular-nums text-sidebar-muted-foreground group-hover/avicode-folder:invisible group-has-[[data-sidebar-action-for]:focus]/avicode-folder:invisible pointer-coarse:invisible">
            {hiddenThreadCount}
          </span>
        ) : null}
        <ChevronDownIcon
          aria-hidden
          className={cn(
            "size-3 shrink-0 text-sidebar-muted-foreground transition-transform",
            folder.collapsed && "-rotate-90",
          )}
        />
      </button>
      {/* Sits over the count, which hides on hover or focus, and left of the chevron. */}
      <span className="absolute inset-y-0 right-6 flex items-center opacity-0 focus-within:opacity-100 group-hover/avicode-folder:opacity-100 pointer-coarse:opacity-100">
        <Button
          data-sidebar-action-for={rowId}
          size="icon-xs"
          variant="ghost-muted"
          aria-label={gt("Folder options for {name}", { name: folder.name })}
          onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            openMenu({ x: bounds.left, y: bounds.bottom }, contextMenuSourceOf(event));
          }}
        >
          <EllipsisIcon aria-hidden />
        </Button>
      </span>
    </li>
  );
});
