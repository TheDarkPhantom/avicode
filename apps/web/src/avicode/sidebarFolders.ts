import { create } from "zustand";

import { randomUUID } from "~/lib/utils";

/**
 * A user-named sidebar folder. Membership is by sidebar project key, a project
 * sits in at most one folder, and array order is display order.
 */
export interface SidebarFolder {
  readonly id: string;
  readonly name: string;
  readonly projectKeys: readonly string[];
  readonly collapsed: boolean;
  /** A hidden folder and its projects leave the sidebar; Settings is the way back. */
  readonly hidden: boolean;
}

export const SIDEBAR_FOLDERS_STORAGE_KEY = "avicode:sidebar-folders:v1";
// The first Avi Code kept folders inside upstream's UI state, which drops unknown fields on save.
const LEGACY_UI_STATE_KEY = "t3code:ui-state:v1";
// Stored data, not UI copy: a repaired folder keeps this name until the user renames it.
export const UNTITLED_SIDEBAR_FOLDER_NAME = "Untitled folder";

export interface SidebarFolderStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Repairs persisted folders instead of dropping them: a blank name becomes
 * "Untitled folder", and a project claimed twice stays in the first folder.
 * Only an entry with no usable id is dropped, since nothing can address it.
 */
export function parseSidebarFolders(value: unknown): SidebarFolder[] {
  if (!Array.isArray(value)) return [];
  const folders: SidebarFolder[] = [];
  const ids = new Set<string>();
  const claimed = new Set<string>();
  for (const entry of value) {
    if (!isRecord(entry)) continue;
    const id = typeof entry.id === "string" ? entry.id.trim() : "";
    if (id.length === 0 || ids.has(id)) continue;
    ids.add(id);
    const name = typeof entry.name === "string" ? entry.name.trim() : "";
    const projectKeys: string[] = [];
    for (const key of Array.isArray(entry.projectKeys) ? entry.projectKeys : []) {
      if (typeof key !== "string" || key.length === 0 || claimed.has(key)) continue;
      claimed.add(key);
      projectKeys.push(key);
    }
    folders.push({
      id,
      name: name.length === 0 ? UNTITLED_SIDEBAR_FOLDER_NAME : name,
      projectKeys,
      collapsed: entry.collapsed === true,
      hidden: entry.hidden === true,
    });
  }
  return folders;
}

function parseJson(raw: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch {
    return { ok: false };
  }
}

/**
 * Reads saved folders. Unreadable JSON is copied to a timestamped backup key
 * before the list resets, so a bad write never loses folders without a trace.
 * With nothing saved yet, folders carried over from the first Avi Code's UI
 * state are imported once.
 */
export function readSidebarFolders(
  storage: SidebarFolderStorage,
  now = Date.now(),
): SidebarFolder[] {
  const raw = storage.getItem(SIDEBAR_FOLDERS_STORAGE_KEY);
  if (raw === null) {
    const legacyRaw = storage.getItem(LEGACY_UI_STATE_KEY);
    const legacy = legacyRaw === null ? null : parseJson(legacyRaw);
    const imported =
      legacy?.ok === true && isRecord(legacy.value)
        ? parseSidebarFolders(legacy.value.projectFolders)
        : [];
    if (imported.length > 0) writeSidebarFolders(storage, imported);
    return imported;
  }
  const parsed = parseJson(raw);
  if (!parsed.ok) {
    const backupKey = `${SIDEBAR_FOLDERS_STORAGE_KEY}:corrupt-${now}`;
    try {
      storage.setItem(backupKey, raw);
      console.warn(`Sidebar folders could not be read; the saved value is in "${backupKey}".`);
    } catch {
      console.warn("Sidebar folders could not be read or backed up; starting with none.");
    }
    return [];
  }
  return parseSidebarFolders(isRecord(parsed.value) ? parsed.value.folders : undefined);
}

function writeSidebarFolders(
  storage: SidebarFolderStorage,
  folders: readonly SidebarFolder[],
): void {
  try {
    storage.setItem(SIDEBAR_FOLDERS_STORAGE_KEY, JSON.stringify({ folders }));
  } catch {
    // A full or blocked storage keeps the folders for this session only.
  }
}

/*
 * Transforms are pure and return the same array when nothing changes, so a
 * no-op skips the store update and the write.
 */

export function createSidebarFolder(
  folders: readonly SidebarFolder[],
  id: string,
  name: string,
): readonly SidebarFolder[] {
  const trimmed = name.trim();
  if (trimmed.length === 0 || id.length === 0 || folders.some((folder) => folder.id === id)) {
    return folders;
  }
  return [...folders, { id, name: trimmed, projectKeys: [], collapsed: false, hidden: false }];
}

function updateFolder(
  folders: readonly SidebarFolder[],
  id: string,
  update: (folder: SidebarFolder) => SidebarFolder,
): readonly SidebarFolder[] {
  const index = folders.findIndex((folder) => folder.id === id);
  if (index === -1) return folders;
  const next = update(folders[index]!);
  if (next === folders[index]) return folders;
  return folders.map((folder, position) => (position === index ? next : folder));
}

export function renameSidebarFolder(
  folders: readonly SidebarFolder[],
  id: string,
  name: string,
): readonly SidebarFolder[] {
  const trimmed = name.trim();
  if (trimmed.length === 0) return folders;
  return updateFolder(folders, id, (folder) =>
    folder.name === trimmed ? folder : { ...folder, name: trimmed },
  );
}

/** The folder's projects stay in the sidebar, outside any folder. */
export function deleteSidebarFolder(
  folders: readonly SidebarFolder[],
  id: string,
): readonly SidebarFolder[] {
  return folders.some((folder) => folder.id === id)
    ? folders.filter((folder) => folder.id !== id)
    : folders;
}

export function setSidebarFolderCollapsed(
  folders: readonly SidebarFolder[],
  id: string,
  collapsed: boolean,
): readonly SidebarFolder[] {
  return updateFolder(folders, id, (folder) =>
    folder.collapsed === collapsed ? folder : { ...folder, collapsed },
  );
}

export function setSidebarFolderHidden(
  folders: readonly SidebarFolder[],
  id: string,
  hidden: boolean,
): readonly SidebarFolder[] {
  return updateFolder(folders, id, (folder) =>
    folder.hidden === hidden ? folder : { ...folder, hidden },
  );
}

/**
 * Moves a project into `folderId`, or out of every folder when it is null.
 * `projectKeys` lists every key the project may be saved under, canonical key
 * first; the canonical key is the one stored.
 */
export function assignProjectToSidebarFolder(
  folders: readonly SidebarFolder[],
  projectKeys: readonly string[],
  folderId: string | null,
): readonly SidebarFolder[] {
  const canonical = projectKeys[0];
  if (canonical === undefined || canonical.length === 0) return folders;
  if (folderId !== null && !folders.some((folder) => folder.id === folderId)) return folders;
  const keys = new Set(projectKeys);
  let changed = false;
  const next = folders.map((folder) => {
    const kept = folder.projectKeys.filter((key) => !keys.has(key));
    const projectKeysNext = folder.id === folderId ? [...kept, canonical] : kept;
    const same =
      projectKeysNext.length === folder.projectKeys.length &&
      projectKeysNext.every((key, index) => key === folder.projectKeys[index]);
    if (same) return folder;
    changed = true;
    return { ...folder, projectKeys: projectKeysNext };
  });
  return changed ? next : folders;
}

/** Moves a folder to `toIndex` in the full list, hidden folders included. */
export function moveSidebarFolder(
  folders: readonly SidebarFolder[],
  id: string,
  toIndex: number,
): readonly SidebarFolder[] {
  const from = folders.findIndex((folder) => folder.id === id);
  const to = Math.max(0, Math.min(folders.length - 1, toIndex));
  if (from === -1 || from === to) return folders;
  const next = [...folders];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

/** The folder a project is in, matched on any key it may be saved under. */
export function findSidebarFolderForProject(
  folders: readonly SidebarFolder[],
  projectKeys: readonly string[],
): SidebarFolder | null {
  return (
    folders.find((folder) => projectKeys.some((key) => folder.projectKeys.includes(key))) ?? null
  );
}

/**
 * Keys a sidebar project may be saved under, canonical first. Physical keys
 * keep membership when the project grouping setting regroups the project.
 */
export function sidebarFolderProjectKeys(group: {
  readonly projectKey: string;
  readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
}): string[] {
  return [
    ...new Set([
      group.projectKey,
      ...group.memberProjects.map((member) => member.physicalProjectKey),
    ]),
  ];
}

function resolveBrowserStorage(): SidebarFolderStorage | null {
  try {
    return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
      ? window.localStorage
      : null;
  } catch {
    // Reading localStorage throws where the browser blocks storage.
    return null;
  }
}

const browserStorage = resolveBrowserStorage();

function readInitialFolders(): readonly SidebarFolder[] {
  if (browserStorage === null) return [];
  try {
    return readSidebarFolders(browserStorage);
  } catch {
    return [];
  }
}

export const useSidebarFoldersStore = create<{ readonly folders: readonly SidebarFolder[] }>(
  () => ({ folders: readInitialFolders() }),
);

function updateSidebarFolders(
  transform: (folders: readonly SidebarFolder[]) => readonly SidebarFolder[],
): void {
  const current = useSidebarFoldersStore.getState().folders;
  const next = transform(current);
  if (next === current) return;
  useSidebarFoldersStore.setState({ folders: next });
  if (browserStorage !== null) writeSidebarFolders(browserStorage, next);
}

export const sidebarFolderActions = {
  /** Returns the new folder's id, or null for a blank name. */
  create: (name: string, projectKeys?: readonly string[]): string | null => {
    if (name.trim().length === 0) return null;
    const id = randomUUID();
    updateSidebarFolders((folders) => {
      const created = createSidebarFolder(folders, id, name);
      return projectKeys ? assignProjectToSidebarFolder(created, projectKeys, id) : created;
    });
    return id;
  },
  rename: (id: string, name: string) =>
    updateSidebarFolders((folders) => renameSidebarFolder(folders, id, name)),
  remove: (id: string) => updateSidebarFolders((folders) => deleteSidebarFolder(folders, id)),
  setCollapsed: (id: string, collapsed: boolean) =>
    updateSidebarFolders((folders) => setSidebarFolderCollapsed(folders, id, collapsed)),
  setHidden: (id: string, hidden: boolean) =>
    updateSidebarFolders((folders) => setSidebarFolderHidden(folders, id, hidden)),
  assign: (projectKeys: readonly string[], folderId: string | null) =>
    updateSidebarFolders((folders) => assignProjectToSidebarFolder(folders, projectKeys, folderId)),
  move: (id: string, toIndex: number) =>
    updateSidebarFolders((folders) => moveSidebarFolder(folders, id, toIndex)),
};
