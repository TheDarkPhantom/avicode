import type {
  ContextMenuItem as TreeContextMenuItem,
  ContextMenuOpenContext as TreeContextMenuOpenContext,
  FileTreeRenameEvent,
} from "@pierre/trees";
import type { EnvironmentId, ProjectEntry } from "@t3tools/contracts";
import { FileTree, useFileTree, useFileTreeSearch } from "@pierre/trees/react";
import { serializeComposerFileLink } from "@t3tools/shared/composerTrigger";
import type { AtomCommandResult } from "@t3tools/client-runtime/state/runtime";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { ChevronsDownUp, ChevronsUpDown, FilePlus, FolderPlus, RotateCw } from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupInput } from "~/components/ui/input-group";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { useComposerHandleContext } from "~/composerHandleContext";
import { writeTextToClipboard } from "~/hooks/useCopyToClipboard";
import { useTheme } from "~/hooks/useTheme";
import { cn } from "~/lib/utils";
import { readLocalApi } from "~/localApi";
import { T3_PIERRE_ICONS } from "~/pierre-icons";
import { useAtomCommand } from "~/state/use-atom-command";
import { projectEnvironment } from "~/state/projects";

import { createFileTreeDragMentionController } from "./fileTreeDragMention";
import { useProjectEntriesQuery } from "./projectFilesQueryState";

// Avi Code addition: helpers for the VSCode-like create/rename/delete flows.
// Tree directory paths carry a trailing slash; the wire path never does.
function stripTrailingSlash(path: string): string {
  return path.replace(/\/$/, "");
}
function ensureTrailingSlash(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}
/** Directory prefix (with trailing slash, or "" for root) a new child lands in. */
function parentDirectoryPrefix(path: string): string {
  const stripped = stripTrailingSlash(path);
  const lastSlash = stripped.lastIndexOf("/");
  return lastSlash === -1 ? "" : stripped.slice(0, lastSlash + 1);
}

interface FileBrowserPanelProps {
  environmentId: EnvironmentId;
  cwd: string;
  projectName: string;
  onOpenFile: (relativePath: string) => void;
}

const TREE_UNSAFE_CSS = `
  :host {
    --trees-bg-override: transparent;
    --trees-selected-bg-override: color-mix(in srgb, currentColor 12%, transparent);
    --trees-hover-bg-override: color-mix(in srgb, currentColor 7%, transparent);
    --trees-border-color-override: color-mix(in srgb, currentColor 14%, transparent);
    --trees-font-family-override: var(--font-sans);
    --trees-font-size-override: 12px;
  }
  button[data-type='item'] { border-radius: 5px; }
`;

function treePath(entry: ProjectEntry): string {
  return entry.kind === "directory" ? `${entry.path}/` : entry.path;
}

function RefreshFilesButton(props: { isPending: boolean; onRefresh: () => void }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Refresh workspace files"
            onClick={props.onRefresh}
          />
        }
      >
        <RotateCw className={cn(props.isPending && "animate-spin")} />
      </TooltipTrigger>
      <TooltipPopup>{props.isPending ? "Refreshing…" : "Refresh files"}</TooltipPopup>
    </Tooltip>
  );
}

function FileSearchField(props: {
  ariaLabel: string;
  name: string;
  onClose: () => void;
  onValueChange: (value: string) => void;
  value: string;
}) {
  return (
    <InputGroup variant="ghost" className="h-7 min-w-0 flex-1 rounded-md">
      <InputGroupInput
        type="search"
        name={props.name}
        size="sm"
        value={props.value}
        aria-label={props.ariaLabel}
        placeholder="Search files"
        spellCheck={false}
        onChange={(event) => props.onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          props.onClose();
          event.currentTarget.blur();
        }}
      />
    </InputGroup>
  );
}

export default function FileBrowserPanel({
  environmentId,
  cwd,
  projectName,
  onOpenFile,
}: FileBrowserPanelProps) {
  const { resolvedTheme } = useTheme();
  const composerRef = useComposerHandleContext();
  const entriesQuery = useProjectEntriesQuery(environmentId, cwd);
  const entries = entriesQuery.data?.entries ?? [];
  const entryKinds = useMemo(
    () => new Map(entries.map((entry) => [entry.path, entry.kind] as const)),
    [entries],
  );
  const entryKindsRef = useRef<ReadonlyMap<string, ProjectEntry["kind"]>>(entryKinds);
  const treePaths = useMemo(() => entries.map(treePath), [entries]);
  const treePathsRef = useRef<readonly string[]>(treePaths);
  const previousTreePathsRef = useRef<readonly string[]>([]);

  // The tree renders rows in shadow DOM and its anchor rect is unreliable, so
  // capture the right-click position ourselves; contextmenu is a composed
  // event, so a capture-phase listener sees it with viewport coordinates.
  const contextMenuPointerRef = useRef<{ x: number; y: number; at: number } | null>(null);
  useEffect(() => {
    const capturePointer = (event: MouseEvent) => {
      contextMenuPointerRef.current = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    };
    document.addEventListener("contextmenu", capturePointer, true);
    return () => document.removeEventListener("contextmenu", capturePointer, true);
  }, []);

  // Avi Code addition: file/folder create, rename, and delete for the explorer.
  // Placeholder rows are added optimistically and reconciled on the next refresh;
  // a failed mutation removes/reverts the optimistic node it left behind.
  const treeModelRef = useRef<ReturnType<typeof useFileTree>["model"] | null>(null);
  const pendingCreatesRef = useRef<Map<string, ProjectEntry["kind"]>>(new Map());
  const [allCollapsed, setAllCollapsed] = useState(false);
  const createEntryCommand = useAtomCommand(projectEnvironment.createEntry);
  const renameEntryCommand = useAtomCommand(projectEnvironment.renameEntry);
  const deleteEntryCommand = useAtomCommand(projectEnvironment.deleteEntry);

  // Avi Code addition: entry mutations used to swallow every non-success result,
  // so a rejected create/rename/delete reverted its optimistic row and the panel
  // looked unchanged with no reason given. Surface the failure so a create that
  // never appears is explained instead of silent.
  const reportEntryMutationFailure = (
    result: AtomCommandResult<unknown, unknown>,
    title: string,
  ): void => {
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    const error = squashAtomCommandFailure(result);
    toastManager.add({
      type: "error",
      title,
      description: error instanceof Error ? error.message : "An error occurred.",
    });
  };

  const startCreateEntry = (kind: ProjectEntry["kind"], directoryPrefix: string) => {
    const model = treeModelRef.current;
    if (!model) return;
    const base = kind === "directory" ? "new-folder" : "new-file";
    const makePath = (name: string) =>
      kind === "directory" ? `${directoryPrefix}${name}/` : `${directoryPrefix}${name}`;
    const existing = new Set(treePathsRef.current);
    let name = base;
    for (let index = 2; existing.has(makePath(name)); index += 1) {
      name = `${base}-${index}`;
    }
    const placeholder = makePath(name);
    pendingCreatesRef.current.set(placeholder, kind);
    model.add(placeholder);
    if (directoryPrefix.length > 0) {
      const parent = model.getItem(directoryPrefix);
      if (parent && "expand" in parent) parent.expand();
    }
    const started = model.startRenaming(placeholder, { removeIfCanceled: true });
    if (!started) {
      pendingCreatesRef.current.delete(placeholder);
      model.remove(placeholder, { recursive: true });
    }
  };

  const commitCreateEntry = async (kind: ProjectEntry["kind"], destinationPath: string) => {
    const relativePath = stripTrailingSlash(destinationPath);
    const result = await createEntryCommand({
      environmentId,
      input: { cwd, relativePath, kind },
    });
    if (result._tag === "Success") {
      entriesQuery.refresh();
      if (kind === "file") onOpenFile(relativePath);
      return;
    }
    // The tree already applied the placeholder→name rename; drop it on failure.
    treeModelRef.current?.remove(destinationPath, { recursive: true });
    reportEntryMutationFailure(
      result,
      kind === "directory" ? "Couldn't create folder" : "Couldn't create file",
    );
  };

  const commitRenameEntry = async (sourcePath: string, destinationPath: string) => {
    const fromRelativePath = stripTrailingSlash(sourcePath);
    const toRelativePath = stripTrailingSlash(destinationPath);
    if (fromRelativePath === toRelativePath) return;
    const result = await renameEntryCommand({
      environmentId,
      input: { cwd, fromRelativePath, toRelativePath },
    });
    if (result._tag === "Success") {
      entriesQuery.refresh();
      return;
    }
    // Undo the optimistic move the tree already applied.
    treeModelRef.current?.move(destinationPath, sourcePath);
    reportEntryMutationFailure(result, "Couldn't rename");
  };

  const handleTreeRename = async (event: FileTreeRenameEvent) => {
    const pendingKind = pendingCreatesRef.current.get(event.sourcePath);
    if (pendingKind !== undefined) {
      pendingCreatesRef.current.delete(event.sourcePath);
      await commitCreateEntry(pendingKind, event.destinationPath);
      return;
    }
    await commitRenameEntry(event.sourcePath, event.destinationPath);
  };
  const handleTreeRenameRef = useRef(handleTreeRename);
  useEffect(() => {
    handleTreeRenameRef.current = handleTreeRename;
  });

  const deleteEntry = async (item: TreeContextMenuItem, position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const relativePath = stripTrailingSlash(item.path);
    const displayName = relativePath.split("/").at(-1) ?? relativePath;
    const confirmed = await api.contextMenu.show(
      [
        { id: "delete-heading", label: `Delete "${displayName}"?`, header: true },
        { id: "delete-confirm", label: "Delete", destructive: true },
        { id: "delete-cancel", label: "Cancel" },
      ],
      position,
    );
    if (confirmed !== "delete-confirm") return;
    const result = await deleteEntryCommand({
      environmentId,
      input: { cwd, relativePath },
    });
    if (result._tag === "Success") {
      treeModelRef.current?.remove(item.path, { recursive: true });
      entriesQuery.refresh();
      return;
    }
    reportEntryMutationFailure(result, "Couldn't delete");
  };

  const toggleCollapseAll = () => {
    const model = treeModelRef.current;
    if (!model) return;
    const expand = allCollapsed;
    for (const path of treePathsRef.current) {
      if (!path.endsWith("/")) continue;
      const item = model.getItem(path);
      if (!item || !("expand" in item)) continue;
      if (expand) item.expand();
      else item.collapse();
    }
    setAllCollapsed(!allCollapsed);
  };

  const showEntryContextMenu = async (
    item: TreeContextMenuItem,
    context: TreeContextMenuOpenContext,
  ) => {
    const api = readLocalApi();
    if (!api) {
      context.close();
      return;
    }
    const relativePath = item.path.replace(/\/$/, "");
    const mention = serializeComposerFileLink(relativePath);
    const directoryPrefix =
      item.kind === "directory" ? ensureTrailingSlash(item.path) : parentDirectoryPrefix(item.path);
    const pointer = contextMenuPointerRef.current;
    const pointerIsFresh = pointer !== null && performance.now() - pointer.at < 1000;
    const anchorRect = context.anchorElement.getBoundingClientRect();
    const position = pointerIsFresh
      ? { x: pointer.x, y: pointer.y }
      : { x: anchorRect.left, y: anchorRect.bottom };
    try {
      const clicked = await api.contextMenu.show(
        [
          { id: "new-file", label: "New File" },
          { id: "new-folder", label: "New Folder" },
          { id: "rename", label: "Rename" },
          { id: "delete", label: "Delete", destructive: true },
          { id: "copy-mention", label: "Copy mention" },
          { id: "add-to-chat", label: "Add to chat" },
        ],
        position,
      );
      if (clicked === "new-file" || clicked === "new-folder") {
        startCreateEntry(clicked === "new-folder" ? "directory" : "file", directoryPrefix);
        return;
      }
      if (clicked === "rename") {
        treeModelRef.current?.startRenaming(item.path);
        return;
      }
      if (clicked === "delete") {
        await deleteEntry(item, position);
        return;
      }
      if (clicked === "copy-mention") {
        try {
          await writeTextToClipboard(mention);
          toastManager.add({ type: "success", title: "Mention copied", description: relativePath });
        } catch (error) {
          toastManager.add({
            type: "error",
            title: "Failed to copy mention",
            description: error instanceof Error ? error.message : "An error occurred.",
          });
        }
        return;
      }
      if (clicked === "add-to-chat") {
        const composer = composerRef?.current;
        if (!composer) {
          toastManager.add({
            type: "error",
            title: "Unable to add to chat",
            description: "Open a chat for this project and try again.",
          });
          return;
        }
        const inserted = composer.insertTextAtEnd(`${mention} `, { ensureLeadingBoundary: true });
        if (!inserted) {
          toastManager.add({
            type: "error",
            title: "Unable to add to chat",
            description: "The chat isn't ready to accept input right now.",
          });
        }
      }
    } finally {
      context.close();
    }
  };
  const showEntryContextMenuRef = useRef(showEntryContextMenu);
  useEffect(() => {
    showEntryContextMenuRef.current = showEntryContextMenu;
  });

  // Avi Code addition: the tree library only opens its context menu when the
  // right-click lands on a row, so clicking empty space fell through to the
  // native browser menu (Cut/Copy/Paste). Handle those misses on the panel and
  // offer the root-level create actions instead.
  const showRootContextMenu = async (position: { x: number; y: number }) => {
    const api = readLocalApi();
    if (!api) return;
    const clicked = await api.contextMenu.show(
      [
        { id: "new-file", label: "New File" },
        { id: "new-folder", label: "New Folder" },
      ],
      position,
    );
    if (clicked === "new-file") startCreateEntry("file", "");
    else if (clicked === "new-folder") startCreateEntry("directory", "");
  };
  const handlePanelContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    // A right-click on a tree row is handled by the tree, which prevents the
    // default menu before this bubbles up; only unhandled misses get here.
    if (event.defaultPrevented) return;
    // Leave the toolbar and search field their native menu (e.g. paste).
    if (event.target instanceof HTMLElement && event.target.closest("[data-surface-subheader]")) {
      return;
    }
    event.preventDefault();
    void showRootContextMenu({ x: event.clientX, y: event.clientY });
  };

  const dragMention = useMemo(
    () =>
      createFileTreeDragMentionController({
        deselect: (path) => treeModelRef.current?.getItem(path)?.deselect(),
      }),
    [],
  );
  const { model } = useFileTree({
    composition: {
      contextMenu: {
        triggerMode: "right-click",
        onOpen: (item, context) => {
          void showEntryContextMenuRef.current(item, context);
        },
      },
    },
    // Avi Code addition: inline editing powers New File/New Folder naming and
    // renaming. A canceled create removes its placeholder (removeIfCanceled).
    renaming: {
      onRename: (event) => {
        void handleTreeRenameRef.current(event);
      },
      onError: (message) => {
        toastManager.add({ type: "error", title: "Rename failed", description: message });
      },
    },
    // Rows only need to be draggable so entries can be dropped into the chat
    // composer; rearranging files inside the tree stays off.
    dragAndDrop: { canDrop: () => false },
    density: "compact",
    fileTreeSearchMode: "hide-non-matches",
    flattenEmptyDirectories: true,
    initialExpansion: 1,
    icons: T3_PIERRE_ICONS,
    onSelectionChange: (selectedPaths) => {
      dragMention.handleSelectionChange(selectedPaths);
      // Starting a drag selects the dragged row; that selection is a side
      // effect of the gesture, not a request to open the file.
      if (dragMention.isDragInProgress()) {
        return;
      }
      const selectedPath = selectedPaths.at(-1)?.replace(/\/$/, "");
      if (selectedPath && entryKindsRef.current.get(selectedPath) === "file") {
        onOpenFile(selectedPath);
      }
    },
    paths: [],
    search: false,
    unsafeCSS: TREE_UNSAFE_CSS,
  });
  const search = useFileTreeSearch(model);
  const handleSearchValueChange = (value: string) => {
    if (value.trim().length === 0) {
      search.close();
      return;
    }
    search.setValue(value);
  };

  useEffect(() => {
    if (previousTreePathsRef.current === treePaths) return;
    entryKindsRef.current = entryKinds;
    treePathsRef.current = treePaths;
    previousTreePathsRef.current = treePaths;
    model.resetPaths(treePaths);
  }, [entryKinds, model, treePaths]);

  // Tag tree drags with the composer mention payload. The row is read from
  // the composed event path (the tree's shadow root is open), so this does
  // not depend on running after the tree's own dragstart handler; the drag
  // data store is writable for every dragstart listener in the dispatch.
  // The capture phase runs before the tree's own dragstart handler selects
  // the dragged row, so the drag flag is up before that selection emits.
  const panelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    treeModelRef.current = model;
  }, [model]);
  useEffect(() => {
    const panel = panelRef.current;
    if (panel === null) {
      return;
    }
    const handleDragStart = (event: DragEvent) => dragMention.handleDragStart(event);
    const handleDragEnd = () => dragMention.handleDragEnd();
    panel.addEventListener("dragstart", handleDragStart, true);
    panel.addEventListener("dragend", handleDragEnd);
    return () => {
      panel.removeEventListener("dragstart", handleDragStart, true);
      panel.removeEventListener("dragend", handleDragEnd);
    };
  }, [dragMention]);

  return (
    <div
      ref={panelRef}
      className="flex min-h-0 flex-1 flex-col bg-background"
      data-file-browser-panel={`${environmentId}:${cwd}`}
      onContextMenu={handlePanelContextMenu}
    >
      <div className="surface-subheader gap-1 px-2" data-surface-subheader>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="New file"
                onClick={() => startCreateEntry("file", "")}
              />
            }
          >
            <FilePlus />
          </TooltipTrigger>
          <TooltipPopup>New File</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label="New folder"
                onClick={() => startCreateEntry("directory", "")}
              />
            }
          >
            <FolderPlus />
          </TooltipTrigger>
          <TooltipPopup>New Folder</TooltipPopup>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={allCollapsed ? "Expand all folders" : "Collapse all folders"}
                onClick={toggleCollapseAll}
              />
            }
          >
            {allCollapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}
          </TooltipTrigger>
          <TooltipPopup>{allCollapsed ? "Expand all" : "Collapse all"}</TooltipPopup>
        </Tooltip>
        <RefreshFilesButton isPending={entriesQuery.isPending} onRefresh={entriesQuery.refresh} />
        <FileSearchField
          name="project-files-search"
          ariaLabel={`Search ${projectName} files`}
          value={search.value}
          onValueChange={handleSearchValueChange}
          onClose={search.close}
        />
      </div>
      {entriesQuery.error && entriesQuery.data === null ? (
        <div className="p-4 text-xs leading-relaxed text-destructive">{entriesQuery.error}</div>
      ) : (
        <FileTree
          model={model}
          aria-label={`${projectName} files`}
          className="min-h-0 flex-1 overflow-hidden"
          style={{
            colorScheme: resolvedTheme,
            ["--trees-fg-override" as string]: "var(--foreground)",
          }}
        />
      )}
    </div>
  );
}
