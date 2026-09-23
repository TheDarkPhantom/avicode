/**
 * Right-click actions for a workspace file: reveal it in the environment's file
 * manager and open it in an editor. Reuses the shell's `openInEditor` command,
 * so both actions work for every client and connection mode.
 *
 * Avi Code note: hand-ported from upstream t3code #11842. Upstream gated reveal
 * on a `shellRevealInFileManager` server flag and passed `reveal: true` to
 * `openInEditor`; this fork has neither, and reveals through the `file-manager`
 * editor id like the rest of the app (see OpenInPicker), so the reveal item maps
 * onto that instead.
 */
import {
  EDITORS,
  type ContextMenuItem,
  type EditorId,
  type EnvironmentId,
} from "@t3tools/contracts";
import { useMemo, useCallback } from "react";
import { useAtomValue } from "@effect/atom-react";

import { revealInFileExplorerLabel } from "~/components/preview/fileExplorerLabel";
import { serverEnvironment } from "./state/server";
import { shellEnvironment } from "./state/shell";
import { useAtomCommand } from "./state/use-atom-command";
import { resolvePathLinkTarget } from "./terminal-links";
import { toastManager } from "./components/ui/toast";
import { readLocalApi } from "./localApi";

export type FileContextMenuAction =
  | "reveal-in-folder"
  /** Submenu parent; never the activated id. */
  | "open-with"
  | `editor:${EditorId}`;

export interface FileContextMenuTarget {
  readonly environmentId: EnvironmentId | null;
  /** Workspace-relative file path, as shown in diffs. */
  readonly filePath: string;
  readonly workspaceRoot: string | undefined;
}

/**
 * Absolute path on the environment host for a diff-style target, resolving the
 * workspace-relative path through the workspace root the same way
 * openDiffFilePrimaryAction does. Returns null when the path cannot be
 * resolved, which callers must treat as "no file actions available".
 */
export function resolveFileContextMenuAbsolutePath(target: FileContextMenuTarget): string | null {
  if (target.filePath.length === 0) return null;
  if (target.workspaceRoot === undefined) {
    return target.filePath.startsWith("/") || /^[a-zA-Z]:/.test(target.filePath)
      ? target.filePath
      : null;
  }
  return resolvePathLinkTarget(target.filePath, target.workspaceRoot);
}

const EDITOR_LABEL_BY_ID = new Map(EDITORS.map((editor) => [editor.id, editor.label]));

export interface FileContextMenuCapabilities {
  readonly revealLabel: string | undefined;
  readonly editorIds: ReadonlyArray<EditorId>;
}

/**
 * Menu items for a resolved file: reveal (with OS-aware wording) and an "Open
 * with" submenu of detected editors. Empty when nothing can act.
 */
export function buildFileContextMenuItems(input: {
  readonly hasAbsolutePath: boolean;
  readonly capabilities: FileContextMenuCapabilities;
}): readonly ContextMenuItem<FileContextMenuAction>[] {
  // Without a resolvable absolute path nothing here can act on the file.
  if (!input.hasAbsolutePath) return [];
  const items: ContextMenuItem<FileContextMenuAction>[] = [];
  if (input.capabilities.revealLabel !== undefined) {
    items.push({
      id: "reveal-in-folder",
      label: input.capabilities.revealLabel,
      icon: "folder-tree",
    });
  }
  const editorIds = input.capabilities.editorIds.filter((id) => id !== "file-manager");
  if (editorIds.length > 0) {
    items.push({
      id: "open-with",
      label: "Open with",
      children: editorIds.map((editorId) => ({
        id: `editor:${editorId}` as FileContextMenuAction,
        label: EDITOR_LABEL_BY_ID.get(editorId) ?? editorId,
      })),
    });
  }
  return items;
}

/** Builds and dispatches the file context menu for one environment's files. */
export function useFileContextMenu(environmentId: EnvironmentId | null) {
  const openInEditor = useAtomCommand(shellEnvironment.openInEditor, { reportFailure: false });
  const serverConfig = useAtomValue(serverEnvironment.configValueAtom(environmentId));

  return useMemo(() => {
    const availableEditors = serverConfig?.availableEditors ?? [];
    const capabilities: FileContextMenuCapabilities = {
      // Reveal rides the "file-manager" editor; label follows the client OS,
      // matching OpenInPicker and the preview reveal action.
      revealLabel: availableEditors.includes("file-manager")
        ? revealInFileExplorerLabel(navigator.platform)
        : undefined,
      editorIds: availableEditors,
    };

    const activate = async (
      action: FileContextMenuAction,
      target: FileContextMenuTarget,
    ): Promise<void> => {
      if (action === "open-with") return;
      const absolutePath = resolveFileContextMenuAbsolutePath(target);
      if (absolutePath === null || environmentId === null) return;

      const reveal = action === "reveal-in-folder";
      const editor = reveal
        ? ("file-manager" as const)
        : (action.slice("editor:".length) as EditorId);
      if (!reveal && !capabilities.editorIds.includes(editor)) return;

      const result = await openInEditor({
        environmentId,
        input: { cwd: absolutePath, editor },
      });
      if (result._tag !== "Failure") return;
      toastManager.add({
        type: "error",
        title: reveal
          ? "Unable to reveal file"
          : `Could not open in ${EDITOR_LABEL_BY_ID.get(editor) ?? editor}`,
        description: absolutePath,
      });
    };

    const show = async (
      target: FileContextMenuTarget,
      position?: { x: number; y: number },
    ): Promise<void> => {
      const api = readLocalApi();
      const items = buildFileContextMenuItems({
        hasAbsolutePath: resolveFileContextMenuAbsolutePath(target) !== null,
        capabilities,
      });
      if (items.length === 0 || api === undefined) return;
      const clicked = await api.contextMenu.show(items, position);
      if (clicked === null) return;
      await activate(clicked as FileContextMenuAction, target);
    };

    return {
      buildItems: (target: FileContextMenuTarget) =>
        buildFileContextMenuItems({
          hasAbsolutePath: resolveFileContextMenuAbsolutePath(target) !== null,
          capabilities,
        }),
      capabilities,
      activate,
      show,
    };
  }, [environmentId, openInEditor, serverConfig]);
}

/** Returns an onContextMenu callback that shows the menu at the pointer. */
export function useFileContextMenuHandler(environmentId: EnvironmentId | null) {
  const contextMenu = useFileContextMenu(environmentId);
  return useCallback(
    (target: FileContextMenuTarget, event?: { clientX: number; clientY: number }) => {
      void contextMenu.show(target, event ? { x: event.clientX, y: event.clientY } : undefined);
    },
    [contextMenu],
  );
}
