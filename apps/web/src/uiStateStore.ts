import { Debouncer } from "@tanstack/react-pacer";
import { create } from "zustand";
import { normalizeProjectPathForComparison } from "./lib/projectPaths";
import { randomUUID } from "./lib/utils";

export const PERSISTED_STATE_KEY = "t3code:ui-state:v1";
const THREAD_CHANGED_FILES_EXPANSION_VERSION = 1;
const LEGACY_PERSISTED_STATE_KEYS = [
  "t3code:renderer-state:v8",
  "t3code:renderer-state:v7",
  "t3code:renderer-state:v6",
  "t3code:renderer-state:v5",
  "t3code:renderer-state:v4",
  "t3code:renderer-state:v3",
  "codething:renderer-state:v4",
  "codething:renderer-state:v3",
  "codething:renderer-state:v2",
  "codething:renderer-state:v1",
] as const;

// Avi Code addition: a user-defined sidebar folder. Membership is by project
// key (the same stable key pins and manual order use), a project lives in at
// most one folder, and array order is display order.
export interface ProjectFolder {
  id: string;
  name: string;
  projectKeys: string[];
  collapsed: boolean;
  // Avi Code addition: a hidden folder and its member projects drop out of the
  // sidebar entirely; the only way back is the folder manager in AviCode
  // settings. Absent in older persisted state, so it defaults to false.
  hidden: boolean;
}

export interface PersistedUiState {
  projectExpandedById?: Record<string, boolean>;
  projectOrder?: string[];
  // Avi Code addition: pinned rows. Array order is pin order, which is also the
  // display order, so pinned rows hold a stable position instead of reshuffling
  // on activity the way the upstream activity sort does.
  pinnedProjectKeys?: string[];
  pinnedThreadKeys?: string[];
  // Avi Code addition: user-defined project folders, in display order.
  projectFolders?: ProjectFolder[];
  threadLastVisitedAtById?: Record<string, string>;
  collapsedProjectCwds?: string[];
  expandedProjectCwds?: string[];
  projectOrderCwds?: string[];
  defaultAdvertisedEndpointKey?: string | null;
  threadChangedFilesExpansionVersion?: typeof THREAD_CHANGED_FILES_EXPANSION_VERSION;
  threadChangedFilesExpandedById?: Record<string, Record<string, boolean>>;
}

export interface UiProjectState {
  projectExpandedById: Record<string, boolean>;
  projectOrder: string[];
  // Avi Code addition: physical project keys, pinned-first in this order.
  pinnedProjectKeys: string[];
  // Avi Code addition: user-defined project folders, in display order.
  projectFolders: ProjectFolder[];
}

export interface UiThreadState {
  threadLastVisitedAtById: Record<string, string>;
  threadChangedFilesExpandedById: Record<string, Record<string, boolean>>;
  // Avi Code addition: scoped thread keys, pinned-first in this order.
  pinnedThreadKeys: string[];
  // Avi Code addition: session-only reading state. Deliberately omitted from persistence.
  threadPlanReadingStateById: Record<string, ThreadPlanReadingState>;
}

export interface ThreadPlanReadingState {
  expandedPlanIds: string[];
  anchor: { rowId: string; offsetWithinRow: number } | null;
  lastAccessedAt: number;
}

const MAX_THREAD_PLAN_READING_STATES = 50;

export interface UiEndpointState {
  defaultAdvertisedEndpointKey: string | null;
}

export interface UiState extends UiProjectState, UiThreadState, UiEndpointState {}

const initialState: UiState = {
  projectExpandedById: {},
  projectOrder: [],
  pinnedProjectKeys: [],
  pinnedThreadKeys: [],
  projectFolders: [],
  threadLastVisitedAtById: {},
  threadChangedFilesExpandedById: {},
  threadPlanReadingStateById: {},
  defaultAdvertisedEndpointKey: null,
};

const LEGACY_PROJECT_CWD_PREFERENCE_PREFIX = "legacy-project-cwd:";
const LEGACY_PROJECT_EXPANSION_DEFAULT_KEY = "legacy-project-expansion-default";
let legacyKeysCleanedUp = false;

export function legacyProjectCwdPreferenceKey(cwd: string): string {
  return `${LEGACY_PROJECT_CWD_PREFERENCE_PREFIX}${normalizeProjectPathForComparison(cwd)}`;
}

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [
    ...new Set(
      value.filter((entry): entry is string => typeof entry === "string" && entry.length > 0),
    ),
  ];
}

function sanitizeBooleanRecord(value: unknown): Record<string, boolean> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, boolean] => entry[0].length > 0 && typeof entry[1] === "boolean",
    ),
  );
}

// Avi Code addition: a folder without a usable id genuinely can't be addressed,
// so drop it. A blank name is recoverable, so repair it with a default label
// rather than dropping the folder and orphaning its grouping. Member keys are
// de-duplicated the same way pins are. Every drop is logged so silent loss is
// no longer possible.
const DEFAULT_FOLDER_NAME = "Untitled folder";

function sanitizeProjectFolders(value: unknown): ProjectFolder[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const folders: ProjectFolder[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      console.warn("Dropping malformed persisted folder: not an object.");
      continue;
    }
    const candidate = entry as Partial<ProjectFolder>;
    const id = typeof candidate.id === "string" ? candidate.id : "";
    if (id.length === 0) {
      console.warn("Dropping persisted folder with no usable id.");
      continue;
    }
    const rawName = typeof candidate.name === "string" ? candidate.name.trim() : "";
    const name = rawName.length === 0 ? DEFAULT_FOLDER_NAME : rawName;
    if (rawName.length === 0) {
      console.warn(
        `Repaired persisted folder "${id}" with blank name to "${DEFAULT_FOLDER_NAME}".`,
      );
    }
    folders.push({
      id,
      name,
      projectKeys: sanitizeStringArray(candidate.projectKeys),
      collapsed: candidate.collapsed === true,
      hidden: candidate.hidden === true,
    });
  }
  return folders;
}

function sanitizeTimestampRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        entry[0].length > 0 &&
        typeof entry[1] === "string" &&
        entry[1].length > 0 &&
        Number.isFinite(Date.parse(entry[1])),
    ),
  );
}

export function parsePersistedState(parsed: PersistedUiState): UiState {
  const projectExpandedById =
    parsed.projectExpandedById === undefined
      ? (() => {
          const migrated: Record<string, boolean> = {};
          const collapsedProjectCwds = sanitizeStringArray(parsed.collapsedProjectCwds);
          const expandedProjectCwds = sanitizeStringArray(parsed.expandedProjectCwds);
          for (const cwd of collapsedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = false;
          }
          for (const cwd of expandedProjectCwds) {
            migrated[legacyProjectCwdPreferenceKey(cwd)] = true;
          }
          if (!Array.isArray(parsed.collapsedProjectCwds) && expandedProjectCwds.length > 0) {
            migrated[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] = false;
          }
          return migrated;
        })()
      : sanitizeBooleanRecord(parsed.projectExpandedById);
  const projectOrder =
    parsed.projectOrder === undefined
      ? sanitizeStringArray(parsed.projectOrderCwds).map(legacyProjectCwdPreferenceKey)
      : sanitizeStringArray(parsed.projectOrder);

  return {
    projectExpandedById,
    projectOrder,
    pinnedProjectKeys: sanitizeStringArray(parsed.pinnedProjectKeys),
    pinnedThreadKeys: sanitizeStringArray(parsed.pinnedThreadKeys),
    projectFolders: sanitizeProjectFolders(parsed.projectFolders),
    threadLastVisitedAtById: sanitizeTimestampRecord(parsed.threadLastVisitedAtById),
    threadChangedFilesExpandedById:
      parsed.threadChangedFilesExpansionVersion === THREAD_CHANGED_FILES_EXPANSION_VERSION
        ? sanitizePersistedThreadChangedFilesExpanded(parsed.threadChangedFilesExpandedById)
        : {},
    threadPlanReadingStateById: {},
    defaultAdvertisedEndpointKey:
      typeof parsed.defaultAdvertisedEndpointKey === "string" &&
      parsed.defaultAdvertisedEndpointKey.length > 0
        ? parsed.defaultAdvertisedEndpointKey
        : null,
  };
}

// Avi Code addition: before falling back to empty on a corrupt read, stash the
// raw value under a timestamped key and warn. A failed parse used to silently
// wipe every folder, pin, and manual order with no trace; the backup keeps the
// data recoverable and the log makes the loss visible.
function backupCorruptPersistedState(raw: string): void {
  try {
    const backupKey = `${PERSISTED_STATE_KEY}:corrupt-${Date.now()}`;
    window.localStorage.setItem(backupKey, raw);
    console.warn(
      `Failed to parse persisted UI state (${raw.length} chars); backed up to "${backupKey}" and reset to defaults.`,
    );
  } catch {
    // Storage may be full or unavailable; the warning below still fires.
    console.warn(
      `Failed to parse persisted UI state (${raw.length} chars) and could not back it up; reset to defaults.`,
    );
  }
}

// Avi Code addition: exported for tests to verify corrupt-read recovery.
export function readPersistedState(): UiState {
  if (typeof window === "undefined") {
    return initialState;
  }
  // Storage access itself can throw (localStorage missing in a test window, or
  // disabled/blocked by the browser); treat that as "no saved state" rather
  // than crashing module load. A parse failure is different: the data exists
  // but is corrupt, so it gets backed up before resetting.
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(PERSISTED_STATE_KEY);
  } catch {
    return initialState;
  }
  if (raw) {
    try {
      return parsePersistedState(JSON.parse(raw) as PersistedUiState);
    } catch {
      backupCorruptPersistedState(raw);
      return initialState;
    }
  }
  for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
    let legacyRaw: string | null;
    try {
      legacyRaw = window.localStorage.getItem(legacyKey);
    } catch {
      return initialState;
    }
    if (!legacyRaw) {
      continue;
    }
    try {
      return parsePersistedState(JSON.parse(legacyRaw) as PersistedUiState);
    } catch {
      backupCorruptPersistedState(legacyRaw);
      return initialState;
    }
  }
  return initialState;
}

function sanitizePersistedThreadChangedFilesExpanded(
  value: PersistedUiState["threadChangedFilesExpandedById"],
): Record<string, Record<string, boolean>> {
  if (!value || typeof value !== "object") {
    return {};
  }

  const nextState: Record<string, Record<string, boolean>> = {};
  for (const [threadId, turns] of Object.entries(value)) {
    if (!threadId || !turns || typeof turns !== "object") {
      continue;
    }

    const nextTurns: Record<string, boolean> = {};
    for (const [turnId, expanded] of Object.entries(turns)) {
      if (turnId && typeof expanded === "boolean") {
        nextTurns[turnId] = expanded;
      }
    }

    if (Object.keys(nextTurns).length > 0) {
      nextState[threadId] = nextTurns;
    }
  }

  return nextState;
}

export function persistState(state: UiState): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    const projectExpandedById = Object.fromEntries(
      Object.entries(state.projectExpandedById).filter(
        ([key]) => key !== LEGACY_PROJECT_EXPANSION_DEFAULT_KEY,
      ),
    );
    window.localStorage.setItem(
      PERSISTED_STATE_KEY,
      JSON.stringify({
        projectExpandedById,
        projectOrder: state.projectOrder,
        pinnedProjectKeys: state.pinnedProjectKeys,
        pinnedThreadKeys: state.pinnedThreadKeys,
        projectFolders: state.projectFolders,
        threadLastVisitedAtById: state.threadLastVisitedAtById,
        defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
        threadChangedFilesExpansionVersion: THREAD_CHANGED_FILES_EXPANSION_VERSION,
        threadChangedFilesExpandedById: state.threadChangedFilesExpandedById,
      } satisfies PersistedUiState),
    );
    if (!legacyKeysCleanedUp) {
      legacyKeysCleanedUp = true;
      for (const legacyKey of LEGACY_PERSISTED_STATE_KEYS) {
        window.localStorage.removeItem(legacyKey);
      }
    }
  } catch {
    // Ignore quota/storage errors to avoid breaking chat UX.
  }
}

const debouncedPersistState = new Debouncer(persistState, { wait: 500 });

export function markThreadVisited(state: UiState, threadId: string, visitedAt: string): UiState {
  const visitedAtMs = Date.parse(visitedAt);
  if (!Number.isFinite(visitedAtMs)) {
    return state;
  }
  const previousVisitedAt = state.threadLastVisitedAtById[threadId];
  const previousVisitedAtMs = previousVisitedAt ? Date.parse(previousVisitedAt) : NaN;
  if (
    Number.isFinite(previousVisitedAtMs) &&
    Number.isFinite(visitedAtMs) &&
    previousVisitedAtMs >= visitedAtMs
  ) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: visitedAt,
    },
  };
}

export function markThreadUnread(
  state: UiState,
  threadId: string,
  latestTurnCompletedAt: string | null | undefined,
): UiState {
  if (!latestTurnCompletedAt) {
    return state;
  }
  const latestTurnCompletedAtMs = Date.parse(latestTurnCompletedAt);
  if (Number.isNaN(latestTurnCompletedAtMs)) {
    return state;
  }
  const unreadVisitedAt = new Date(latestTurnCompletedAtMs - 1).toISOString();
  if (state.threadLastVisitedAtById[threadId] === unreadVisitedAt) {
    return state;
  }
  return {
    ...state,
    threadLastVisitedAtById: {
      ...state.threadLastVisitedAtById,
      [threadId]: unreadVisitedAt,
    },
  };
}

export function setThreadChangedFilesExpanded(
  state: UiState,
  threadId: string,
  turnId: string,
  expanded: boolean,
): UiState {
  const currentThreadState = state.threadChangedFilesExpandedById[threadId] ?? {};
  if (currentThreadState[turnId] === expanded) {
    return state;
  }

  return {
    ...state,
    threadChangedFilesExpandedById: {
      ...state.threadChangedFilesExpandedById,
      [threadId]: {
        ...currentThreadState,
        [turnId]: expanded,
      },
    },
  };
}

function withBoundedPlanReadingState(
  state: UiState,
  threadKey: string,
  entry: ThreadPlanReadingState,
): UiState {
  const entries = { ...state.threadPlanReadingStateById, [threadKey]: entry };
  const overflow = Object.keys(entries).length - MAX_THREAD_PLAN_READING_STATES;
  if (overflow > 0) {
    for (const [key] of Object.entries(entries)
      .filter(([key]) => key !== threadKey)
      .sort(([, a], [, b]) => a.lastAccessedAt - b.lastAccessedAt)
      .slice(0, overflow)) {
      delete entries[key];
    }
  }
  return { ...state, threadPlanReadingStateById: entries };
}

export function setThreadPlanExpanded(
  state: UiState,
  threadKey: string,
  planId: string,
  expanded: boolean,
  now = Date.now(),
): UiState {
  if (!threadKey || !planId) return state;
  const current = state.threadPlanReadingStateById[threadKey] ?? {
    expandedPlanIds: [],
    anchor: null,
    lastAccessedAt: now,
  };
  const expandedPlanIds = expanded
    ? [...new Set([...current.expandedPlanIds, planId])]
    : current.expandedPlanIds.filter((id) => id !== planId);
  return withBoundedPlanReadingState(state, threadKey, {
    ...current,
    expandedPlanIds,
    lastAccessedAt: now,
  });
}

export function setThreadPlanReadingAnchor(
  state: UiState,
  threadKey: string,
  anchor: ThreadPlanReadingState["anchor"],
  now = Date.now(),
): UiState {
  if (!threadKey) return state;
  const existing = state.threadPlanReadingStateById[threadKey];
  if (anchor === null) {
    // Clearing: only touch state when there is a stored anchor to drop, so
    // returning to the live edge resets the reopen position without creating an
    // empty entry for a thread that never had one.
    if (!existing || existing.anchor === null) return state;
    return withBoundedPlanReadingState(state, threadKey, {
      ...existing,
      anchor: null,
      lastAccessedAt: now,
    });
  }
  const current = existing ?? {
    expandedPlanIds: [],
    anchor: null,
    lastAccessedAt: now,
  };
  return withBoundedPlanReadingState(state, threadKey, {
    ...current,
    anchor,
    lastAccessedAt: now,
  });
}

export function setDefaultAdvertisedEndpointKey(state: UiState, key: string | null): UiState {
  const nextKey = key && key.length > 0 ? key : null;
  if (state.defaultAdvertisedEndpointKey === nextKey) {
    return state;
  }
  return {
    ...state,
    defaultAdvertisedEndpointKey: nextKey,
  };
}

export function resolveProjectExpanded(
  projectExpandedById: Readonly<Record<string, boolean>>,
  preferenceKeys: readonly string[],
  // Avi Code addition: the fallback for a project the user has never toggled.
  // Callers pass `!aviCodeSidebarProjectsCollapsedByDefault` so the collapse
  // default only decides untouched projects; explicit choices above still win.
  defaultExpanded = true,
): boolean {
  for (const key of preferenceKeys) {
    const expanded = projectExpandedById[key];
    if (expanded !== undefined) {
      return expanded;
    }
  }
  return projectExpandedById[LEGACY_PROJECT_EXPANSION_DEFAULT_KEY] ?? defaultExpanded;
}

export function setProjectExpanded(
  state: UiState,
  projectIds: string | readonly string[],
  expanded: boolean,
): UiState {
  const ids = typeof projectIds === "string" ? [projectIds] : projectIds;
  const nextEntries = ids.filter((projectId) => state.projectExpandedById[projectId] !== expanded);
  if (nextEntries.length === 0) {
    return state;
  }
  const projectExpandedById = { ...state.projectExpandedById };
  for (const projectId of nextEntries) {
    projectExpandedById[projectId] = expanded;
  }
  return {
    ...state,
    projectExpandedById,
  };
}

/**
 * Avi Code addition: the shared pin/unpin transform.
 *
 * Pinning appends, so the array doubles as the display order and an existing
 * pin never moves when a new one joins. Returns null when nothing changed, so
 * callers can hand back the same state reference and skip a re-render.
 */
function applyPinnedKeys(
  pinnedKeys: readonly string[],
  keys: string | readonly string[],
  pinned: boolean,
): string[] | null {
  const requested = (typeof keys === "string" ? [keys] : keys).filter((key) => key.length > 0);
  if (requested.length === 0) {
    return null;
  }
  if (pinned) {
    const current = new Set(pinnedKeys);
    const added = [...new Set(requested.filter((key) => !current.has(key)))];
    return added.length === 0 ? null : [...pinnedKeys, ...added];
  }
  const removed = new Set(requested);
  const next = pinnedKeys.filter((key) => !removed.has(key));
  return next.length === pinnedKeys.length ? null : next;
}

export function setProjectPinned(
  state: UiState,
  projectKeys: string | readonly string[],
  pinned: boolean,
): UiState {
  const pinnedProjectKeys = applyPinnedKeys(state.pinnedProjectKeys, projectKeys, pinned);
  return pinnedProjectKeys === null ? state : { ...state, pinnedProjectKeys };
}

export function setThreadPinned(
  state: UiState,
  threadKeys: string | readonly string[],
  pinned: boolean,
): UiState {
  const pinnedThreadKeys = applyPinnedKeys(state.pinnedThreadKeys, threadKeys, pinned);
  return pinnedThreadKeys === null ? state : { ...state, pinnedThreadKeys };
}

export function reorderProjects(
  state: UiState,
  currentProjectOrder: readonly string[],
  draggedProjectIds: readonly string[],
  targetProjectIds: readonly string[],
): UiState {
  if (draggedProjectIds.length === 0) {
    return state;
  }
  const draggedSet = new Set(draggedProjectIds);
  const targetSet = new Set(targetProjectIds);
  if (draggedProjectIds.every((id) => targetSet.has(id))) {
    return state;
  }

  const originalTargetIndex = currentProjectOrder.findIndex((id) => targetSet.has(id));
  if (originalTargetIndex < 0) {
    return state;
  }

  const projectOrder = [...currentProjectOrder];

  const removed: string[] = [];
  let draggedBeforeTarget = 0;
  for (let i = projectOrder.length - 1; i >= 0; i--) {
    if (draggedSet.has(projectOrder[i]!)) {
      removed.unshift(projectOrder.splice(i, 1)[0]!);
      if (i < originalTargetIndex) {
        draggedBeforeTarget++;
      }
    }
  }
  if (removed.length === 0) {
    return state;
  }

  const insertIndex = originalTargetIndex - Math.max(0, draggedBeforeTarget - 1);
  projectOrder.splice(insertIndex, 0, ...removed);
  return {
    ...state,
    projectOrder,
  };
}

/**
 * Avi Code addition: project folder transforms.
 *
 * All follow the same contract as the pin/reorder helpers — pure, and they
 * return the same state reference when nothing changes so callers can skip a
 * re-render. A project lives in at most one folder.
 */

// Reorder the folder array to match `orderedFolderIds`. Only ids that already
// exist are honored; folders whose ids are omitted (e.g. hidden ones the caller
// never rendered) keep their relative order and trail the reordered set. Returns
// the same state reference when the array is unchanged.
export function reorderProjectFolders(
  state: UiState,
  orderedFolderIds: readonly string[],
): UiState {
  const known = new Set(state.projectFolders.map((folder) => folder.id));
  const seen = new Set<string>();
  const orderedKnownIds: string[] = [];
  for (const id of orderedFolderIds) {
    if (known.has(id) && !seen.has(id)) {
      seen.add(id);
      orderedKnownIds.push(id);
    }
  }
  if (orderedKnownIds.length === 0) {
    return state;
  }
  const byId = new Map(state.projectFolders.map((folder) => [folder.id, folder] as const));
  const reordered = orderedKnownIds.map((id) => byId.get(id)!);
  const remainder = state.projectFolders.filter((folder) => !seen.has(folder.id));
  const nextFolders = [...reordered, ...remainder];
  const unchanged = nextFolders.every((folder, index) => folder === state.projectFolders[index]);
  return unchanged ? state : { ...state, projectFolders: nextFolders };
}

export function createProjectFolder(state: UiState, name: string, id: string): UiState {
  const trimmed = name.trim();
  if (trimmed.length === 0 || id.length === 0) {
    return state;
  }
  return {
    ...state,
    projectFolders: [
      ...state.projectFolders,
      { id, name: trimmed, projectKeys: [], collapsed: false, hidden: false },
    ],
  };
}

export function renameProjectFolder(state: UiState, id: string, name: string): UiState {
  const trimmed = name.trim();
  const folder = state.projectFolders.find((entry) => entry.id === id);
  if (trimmed.length === 0 || !folder || folder.name === trimmed) {
    return state;
  }
  return {
    ...state,
    projectFolders: state.projectFolders.map((entry) =>
      entry.id === id ? { ...entry, name: trimmed } : entry,
    ),
  };
}

export function deleteProjectFolder(state: UiState, id: string): UiState {
  if (!state.projectFolders.some((entry) => entry.id === id)) {
    return state;
  }
  return {
    ...state,
    projectFolders: state.projectFolders.filter((entry) => entry.id !== id),
  };
}

export function setProjectFolderCollapsed(state: UiState, id: string, collapsed: boolean): UiState {
  const folder = state.projectFolders.find((entry) => entry.id === id);
  if (!folder || folder.collapsed === collapsed) {
    return state;
  }
  return {
    ...state,
    projectFolders: state.projectFolders.map((entry) =>
      entry.id === id ? { ...entry, collapsed } : entry,
    ),
  };
}

export function setProjectFolderHidden(state: UiState, id: string, hidden: boolean): UiState {
  const folder = state.projectFolders.find((entry) => entry.id === id);
  if (!folder || folder.hidden === hidden) {
    return state;
  }
  return {
    ...state,
    projectFolders: state.projectFolders.map((entry) =>
      entry.id === id ? { ...entry, hidden } : entry,
    ),
  };
}

export function assignProjectToFolder(
  state: UiState,
  projectKey: string,
  folderId: string | null,
): UiState {
  if (projectKey.length === 0) {
    return state;
  }
  let changed = false;
  const projectFolders = state.projectFolders.map((folder) => {
    const isTarget = folder.id === folderId;
    const has = folder.projectKeys.includes(projectKey);
    if (isTarget) {
      if (has) return folder;
      changed = true;
      return { ...folder, projectKeys: [...folder.projectKeys, projectKey] };
    }
    if (!has) return folder;
    changed = true;
    return { ...folder, projectKeys: folder.projectKeys.filter((key) => key !== projectKey) };
  });
  return changed ? { ...state, projectFolders } : state;
}

interface UiStateStore extends UiState {
  markThreadVisited: (threadId: string, visitedAt: string) => void;
  markThreadUnread: (threadId: string, latestTurnCompletedAt: string | null | undefined) => void;
  setThreadChangedFilesExpanded: (threadId: string, turnId: string, expanded: boolean) => void;
  setThreadPlanExpanded: (threadKey: string, planId: string, expanded: boolean) => void;
  setThreadPlanReadingAnchor: (threadKey: string, anchor: ThreadPlanReadingState["anchor"]) => void;
  setDefaultAdvertisedEndpointKey: (key: string | null) => void;
  setProjectExpanded: (projectIds: string | readonly string[], expanded: boolean) => void;
  // Avi Code addition.
  setProjectPinned: (projectKeys: string | readonly string[], pinned: boolean) => void;
  setThreadPinned: (threadKeys: string | readonly string[], pinned: boolean) => void;
  reorderProjects: (
    currentProjectOrder: readonly string[],
    draggedProjectIds: readonly string[],
    targetProjectIds: readonly string[],
  ) => void;
  // Avi Code addition: project folders. createProjectFolder returns the new
  // folder id so a caller that just made one can immediately move a project in.
  createProjectFolder: (name: string) => string | null;
  renameProjectFolder: (id: string, name: string) => void;
  deleteProjectFolder: (id: string) => void;
  setProjectFolderCollapsed: (id: string, collapsed: boolean) => void;
  setProjectFolderHidden: (id: string, hidden: boolean) => void;
  reorderProjectFolders: (orderedFolderIds: readonly string[]) => void;
  assignProjectToFolder: (projectKey: string, folderId: string | null) => void;
}

export const useUiStateStore = create<UiStateStore>((set) => ({
  ...readPersistedState(),
  markThreadVisited: (threadId, visitedAt) => {
    set((state) => markThreadVisited(state, threadId, visitedAt));
    debouncedPersistState.cancel();
    persistState(useUiStateStore.getState());
  },
  markThreadUnread: (threadId, latestTurnCompletedAt) => {
    set((state) => markThreadUnread(state, threadId, latestTurnCompletedAt));
    debouncedPersistState.cancel();
    persistState(useUiStateStore.getState());
  },
  setThreadChangedFilesExpanded: (threadId, turnId, expanded) =>
    set((state) => setThreadChangedFilesExpanded(state, threadId, turnId, expanded)),
  setThreadPlanExpanded: (threadKey, planId, expanded) =>
    set((state) => setThreadPlanExpanded(state, threadKey, planId, expanded)),
  setThreadPlanReadingAnchor: (threadKey, anchor) =>
    set((state) => setThreadPlanReadingAnchor(state, threadKey, anchor)),
  setDefaultAdvertisedEndpointKey: (key) =>
    set((state) => setDefaultAdvertisedEndpointKey(state, key)),
  setProjectExpanded: (projectIds, expanded) =>
    set((state) => setProjectExpanded(state, projectIds, expanded)),
  setProjectPinned: (projectKeys, pinned) =>
    set((state) => setProjectPinned(state, projectKeys, pinned)),
  setThreadPinned: (threadKeys, pinned) =>
    set((state) => setThreadPinned(state, threadKeys, pinned)),
  reorderProjects: (currentProjectOrder, draggedProjectIds, targetProjectIds) =>
    set((state) =>
      reorderProjects(state, currentProjectOrder, draggedProjectIds, targetProjectIds),
    ),
  createProjectFolder: (name) => {
    if (name.trim().length === 0) {
      return null;
    }
    const id = randomUUID();
    set((state) => createProjectFolder(state, name, id));
    return id;
  },
  renameProjectFolder: (id, name) => set((state) => renameProjectFolder(state, id, name)),
  deleteProjectFolder: (id) => set((state) => deleteProjectFolder(state, id)),
  setProjectFolderCollapsed: (id, collapsed) =>
    set((state) => setProjectFolderCollapsed(state, id, collapsed)),
  setProjectFolderHidden: (id, hidden) => set((state) => setProjectFolderHidden(state, id, hidden)),
  reorderProjectFolders: (orderedFolderIds) =>
    set((state) => reorderProjectFolders(state, orderedFolderIds)),
  assignProjectToFolder: (projectKey, folderId) =>
    set((state) => assignProjectToFolder(state, projectKey, folderId)),
}));

useUiStateStore.subscribe((state) => debouncedPersistState.maybeExecute(state));

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    debouncedPersistState.flush();
  });
  window.addEventListener("pagehide", () => {
    debouncedPersistState.flush();
  });
  if (typeof document !== "undefined" && typeof document.addEventListener === "function") {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") {
        debouncedPersistState.flush();
      }
    });
  }
}
