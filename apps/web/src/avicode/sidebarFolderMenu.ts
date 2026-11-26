import type { ContextMenuItem } from "@t3tools/contracts";
import { msg } from "gt-react";

import type { MessageResolver } from "~/i18n/messages";
import {
  findSidebarFolderForProject,
  sidebarFolderActions,
  sidebarFolderProjectKeys,
  useSidebarFoldersStore,
} from "./sidebarFolders";
import { openSidebarFolderNameDialog } from "./sidebarFolderNameDialogStore";

const MENU_PREFIX = "avicode-folder:";
const ASSIGN_PREFIX = `${MENU_PREFIX}assign:`;
const REMOVE_ID = `${MENU_PREFIX}remove`;
const NEW_ID = `${MENU_PREFIX}new`;

type FolderMenuProject = Parameters<typeof sidebarFolderProjectKeys>[0] & {
  readonly displayName: string;
};

/** The "Move to folder" submenu for a project's context menu. */
export function sidebarFolderMenuItem(
  project: FolderMenuProject,
  resolve: MessageResolver,
): ContextMenuItem {
  const folders = useSidebarFoldersStore.getState().folders;
  const current = findSidebarFolderForProject(folders, sidebarFolderProjectKeys(project));
  return {
    id: `${MENU_PREFIX}menu`,
    label: resolve(msg("Move to folder")),
    children: [
      ...folders.map((folder) => ({
        id: `${ASSIGN_PREFIX}${folder.id}`,
        label: folder.name,
        ...(folder.id === current?.id ? { checked: true, disabled: true } : {}),
      })),
      ...(current === null
        ? []
        : [{ id: REMOVE_ID, label: resolve(msg("Remove from folder")), separatorBefore: true }]),
      {
        id: NEW_ID,
        label: resolve(msg("New folder…")),
        separatorBefore: folders.length > 0 && current === null,
      },
    ],
  };
}

/** Runs a chosen "Move to folder" item. Returns false for any other menu choice. */
export function handleSidebarFolderMenuChoice(choice: string, project: FolderMenuProject): boolean {
  if (!choice.startsWith(MENU_PREFIX)) return false;
  const projectKeys = sidebarFolderProjectKeys(project);
  if (choice === REMOVE_ID) sidebarFolderActions.assign(projectKeys, null);
  else if (choice === NEW_ID) {
    openSidebarFolderNameDialog({
      kind: "create",
      projectKeys,
      projectName: project.displayName,
    });
  } else if (choice.startsWith(ASSIGN_PREFIX)) {
    sidebarFolderActions.assign(projectKeys, choice.slice(ASSIGN_PREFIX.length));
  }
  return true;
}
