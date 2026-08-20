/**
 * Thread-scoped right-panel surface state.
 *
 * This is intentionally a shallow workspace model: it owns an ordered set of
 * surface descriptors and the active surface, while each feature continues to
 * own its durable resource state. Browser surfaces point at preview tab ids,
 * terminal surfaces point at terminal session ids, file surfaces point at
 * workspace paths, and diff/plan/files remain singleton surfaces.
 */
import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";

export const RIGHT_PANEL_KINDS = ["plan", "diff", "files", "file", "preview", "terminal"] as const;
export type RightPanelKind = (typeof RIGHT_PANEL_KINDS)[number];

export type RightPanelSurface =
  // Avi Code addition: `secondaryTabId` pairs a second preview tab into this
  // surface so two previews render side by side (local dev vs prod). Exactly two
  // is enforced structurally by a single optional scalar; the `browser:new`
  // placeholder never splits.
  | { id: `browser:${string}`; kind: "preview"; resourceId: string; secondaryTabId?: string }
  | { id: "browser:new"; kind: "preview"; resourceId: null; secondaryTabId?: never }
  | {
      id: `terminal:${string}`;
      kind: "terminal";
      resourceId: string;
      terminalIds: string[];
      activeTerminalId: string;
      splitDirection?: "horizontal" | "vertical";
    }
  | { id: "diff"; kind: "diff" }
  | { id: "files"; kind: "files" }
  | {
      id: `file:${string}`;
      kind: "file";
      relativePath: string;
      /**
       * Avi Code addition: the folder this file is relative to, when it is not
       * the thread's own workspace. Absent means the thread workspace, which
       * keeps every surface persisted before cross-repo opening valid.
       */
      root?: string;
      revealLine: number | null;
      revealRequestId: number;
    }
  | { id: "plan"; kind: "plan" };

const RIGHT_PANEL_STORAGE_KEY = "t3code:right-panel-state:v2";
// Avi Code addition: bumped 8 -> 9 for preview `secondaryTabId` validation.
const RIGHT_PANEL_STORAGE_VERSION = 9;

export interface ThreadRightPanelState {
  isOpen: boolean;
  activeSurfaceId: string | null;
  surfaces: RightPanelSurface[];
}

/**
 * The last deliberate open/close the user performed, carried across threads so
 * the panel can follow them when `rightPanelFollowsThreads` is enabled.
 *
 * Only the visibility flag and a *reproducible* surface kind travel. Surfaces
 * themselves are inherently thread-scoped — a file path, terminal session, or
 * preview tab from one thread is meaningless in another — so a thread adopting
 * the preference opens its own instance of `preferredKind` instead.
 */
export interface RightPanelVisibilityPreference {
  isOpen: boolean;
  preferredKind: RightPanelFollowKind | null;
}

/**
 * Surface kinds a different thread can recreate from nothing. `file` and
 * `terminal` are excluded because they are bound to a path or session id.
 */
export const RIGHT_PANEL_FOLLOW_KINDS = ["diff", "files", "plan", "preview"] as const;
export type RightPanelFollowKind = (typeof RIGHT_PANEL_FOLLOW_KINDS)[number];

function isFollowKind(kind: RightPanelKind): kind is RightPanelFollowKind {
  return (RIGHT_PANEL_FOLLOW_KINDS as readonly RightPanelKind[]).includes(kind);
}

/** A live (non-placeholder) preview surface: has a real tab id to render. */
export type LivePreviewSurface = {
  id: `browser:${string}`;
  kind: "preview";
  resourceId: string;
} & {
  secondaryTabId?: string;
};

/**
 * Avi Code addition: whether `dragged` may split into `active` as a second
 * preview pane. True only when both are live previews, `active` is not already
 * split, and the two point at different tabs.
 */
export function canSplitPreview(
  active: RightPanelSurface | null | undefined,
  dragged: RightPanelSurface | null | undefined,
): active is LivePreviewSurface {
  return (
    active?.kind === "preview" &&
    active.resourceId !== null &&
    active.secondaryTabId === undefined &&
    dragged?.kind === "preview" &&
    dragged.resourceId !== null &&
    dragged.resourceId !== active.resourceId
  );
}

const isLivePreview = (
  surface: RightPanelSurface | null | undefined,
): surface is LivePreviewSurface => surface?.kind === "preview" && surface.resourceId !== null;

/**
 * Avi Code addition: resolves which tab becomes the second pane when the tab
 * `draggedSurfaceId` is dropped on the split zone, or `null` when no split is
 * possible. The active preview always stays the primary (left) pane:
 *
 * - dragging a *different* preview tab pairs it beside the active preview;
 * - dragging the active preview tab itself pairs it with the next other preview
 *   (unambiguous in the two-preview case this feature targets).
 *
 * This is why the visible tab is draggable too, not only background tabs.
 */
export function resolvePreviewSplitSecondary(
  surfaces: readonly RightPanelSurface[],
  activeSurfaceId: string | null,
  draggedSurfaceId: string,
): string | null {
  const active = surfaces.find((surface) => surface.id === activeSurfaceId);
  if (!isLivePreview(active) || active.secondaryTabId !== undefined) return null;
  const dragged = surfaces.find((surface) => surface.id === draggedSurfaceId);
  if (!isLivePreview(dragged)) return null;
  if (dragged.resourceId !== active.resourceId) return dragged.resourceId;
  // Dragging the active tab itself: pair it with another open preview.
  const other = surfaces.find(
    (surface): surface is LivePreviewSurface =>
      isLivePreview(surface) && surface.resourceId !== active.resourceId,
  );
  return other?.resourceId ?? null;
}

/**
 * Avi Code addition: resolves the pair rendered side by side when `activeSurface`
 * belongs to a split, or `null` when it is a plain preview. The split is stored
 * only on the primary, but either paired tab may be active (both stay visible in
 * the strip, Chrome-style), so this looks from either side.
 */
export function resolveActivePreviewSplit(
  surfaces: readonly RightPanelSurface[],
  activeSurface: RightPanelSurface | null | undefined,
): { primaryTabId: string; secondaryTabId: string } | null {
  if (!isLivePreview(activeSurface)) return null;
  if (activeSurface.secondaryTabId !== undefined) {
    return { primaryTabId: activeSurface.resourceId, secondaryTabId: activeSurface.secondaryTabId };
  }
  const owner = surfaces.find(
    (surface): surface is LivePreviewSurface =>
      isLivePreview(surface) && surface.secondaryTabId === activeSurface.resourceId,
  );
  return owner
    ? { primaryTabId: owner.resourceId, secondaryTabId: activeSurface.resourceId }
    : null;
}

const stripPreviewSecondary = (surface: LivePreviewSurface): RightPanelSurface => {
  const { secondaryTabId: _dropped, ...rest } = surface;
  return rest;
};

/**
 * Avi Code addition: clears any `secondaryTabId` that no longer points at an open
 * preview, so closing one pane of a split leaves the other whole instead of a
 * dangling reference.
 */
const clearDanglingPreviewSecondaries = (
  surfaces: readonly RightPanelSurface[],
): RightPanelSurface[] => {
  const liveResourceIds = new Set(
    surfaces.flatMap((surface) => (isLivePreview(surface) ? [surface.resourceId] : [])),
  );
  return surfaces.map((surface) =>
    isLivePreview(surface) &&
    surface.secondaryTabId !== undefined &&
    !liveResourceIds.has(surface.secondaryTabId)
      ? stripPreviewSecondary(surface)
      : surface,
  );
};

const DEFAULT_VISIBILITY_PREFERENCE: RightPanelVisibilityPreference = {
  isOpen: false,
  preferredKind: null,
};

interface RightPanelStoreState {
  byThreadKey: Record<string, ThreadRightPanelState>;
  visibilityPreference: RightPanelVisibilityPreference;
  /** Applies the carried preference to `ref`. No-op when they already agree. */
  adoptVisibilityPreference: (ref: ScopedThreadRef) => void;
  open: (ref: ScopedThreadRef, kind: Exclude<RightPanelKind, "file" | "terminal">) => void;
  openBrowser: (ref: ScopedThreadRef, tabId: string | null) => void;
  openFile: (ref: ScopedThreadRef, relativePath: string, line?: number, root?: string) => void;
  /**
   * Avi Code addition: moves an open file tab onto the repo that actually holds
   * it, in place, so a path that turned out to belong elsewhere corrects itself
   * instead of leaving a dead tab beside a working one.
   */
  rerootFile: (ref: ScopedThreadRef, surfaceId: string, root: string, relativePath: string) => void;
  openTerminal: (ref: ScopedThreadRef, terminalId: string) => void;
  splitTerminal: (
    ref: ScopedThreadRef,
    surfaceId: string,
    terminalId: string,
    direction?: "horizontal" | "vertical",
  ) => void;
  activateTerminal: (ref: ScopedThreadRef, surfaceId: string, terminalId: string) => void;
  closeTerminal: (ref: ScopedThreadRef, surfaceId: string, terminalId: string) => void;
  /**
   * Avi Code addition: pairs `secondaryTabId` into the preview surface so two
   * previews render side by side; absorbs the secondary's standalone tab.
   */
  splitPreview: (ref: ScopedThreadRef, surfaceId: string, secondaryTabId: string) => void;
  /** Avi Code addition: undoes {@link splitPreview}, restoring the second tab. */
  unsplitPreview: (ref: ScopedThreadRef, surfaceId: string) => void;
  activateSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeSurface: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeOtherSurfaces: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeSurfacesToRight: (ref: ScopedThreadRef, surfaceId: string) => void;
  closeAllSurfaces: (ref: ScopedThreadRef) => void;
  reconcileBrowserSurfaces: (ref: ScopedThreadRef, tabIds: readonly string[]) => void;
  reconcileFileSurfaces: (ref: ScopedThreadRef, workspaceAvailable: boolean) => void;
  show: (ref: ScopedThreadRef) => void;
  close: (ref: ScopedThreadRef) => void;
  toggleVisibility: (ref: ScopedThreadRef) => void;
  toggle: (ref: ScopedThreadRef, kind: Exclude<RightPanelKind, "file" | "terminal">) => void;
  removeThread: (ref: ScopedThreadRef) => void;
}

const EMPTY_THREAD_STATE: ThreadRightPanelState = {
  isOpen: false,
  activeSurfaceId: null,
  surfaces: [],
};

const singletonSurface = (
  kind: Exclude<RightPanelKind, "file" | "preview" | "terminal">,
): RightPanelSurface => {
  switch (kind) {
    case "diff":
      return { id: "diff", kind };
    case "files":
      return { id: "files", kind };
    case "plan":
      return { id: "plan", kind };
  }
};

const browserSurface = (tabId: string | null): RightPanelSurface =>
  tabId
    ? { id: `browser:${tabId}`, kind: "preview", resourceId: tabId }
    : { id: "browser:new", kind: "preview", resourceId: null };

/**
 * Avi Code addition: the id carries the root so the same relative path in two
 * repos opens as two tabs. Keeping the plain shape when there is no root leaves
 * surfaces persisted before cross-repo opening loadable.
 */
const fileSurfaceId = (relativePath: string, root: string | undefined) =>
  (root ? `file:${root}\u0000${relativePath}` : `file:${relativePath}`) as `file:${string}`;

const fileSurface = (
  relativePath: string,
  root: string | undefined,
  revealLine: number | null,
  revealRequestId: number,
): RightPanelSurface => ({
  id: fileSurfaceId(relativePath, root),
  kind: "file",
  relativePath,
  ...(root ? { root } : {}),
  revealLine,
  revealRequestId,
});

const terminalSurface = (terminalId: string): RightPanelSurface => ({
  id: `terminal:${terminalId}`,
  kind: "terminal",
  resourceId: terminalId,
  terminalIds: [terminalId],
  activeTerminalId: terminalId,
});

const upsertSurface = (
  current: ThreadRightPanelState,
  surface: RightPanelSurface,
  activate = true,
): ThreadRightPanelState => ({
  isOpen: true,
  surfaces: current.surfaces.some((entry) => entry.id === surface.id)
    ? current.surfaces
    : [...current.surfaces, surface],
  activeSurfaceId: activate ? surface.id : current.activeSurfaceId,
});

const updateThread = (
  byThreadKey: Record<string, ThreadRightPanelState>,
  threadKey: string,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Record<string, ThreadRightPanelState> => {
  const current = byThreadKey[threadKey] ?? EMPTY_THREAD_STATE;
  const next = updater(current);
  if (!next.isOpen && next.activeSurfaceId === null && next.surfaces.length === 0) {
    if (!(threadKey in byThreadKey)) return byThreadKey;
    const { [threadKey]: _removed, ...rest } = byThreadKey;
    return rest;
  }
  if (next === current) return byThreadKey;
  return { ...byThreadKey, [threadKey]: next };
};

function visibilityPreferenceFrom(state: ThreadRightPanelState): RightPanelVisibilityPreference {
  const active = state.surfaces.find((surface) => surface.id === state.activeSurfaceId);
  return {
    isOpen: state.isOpen,
    preferredKind: active && isFollowKind(active.kind) ? active.kind : null,
  };
}

/**
 * Resolves the panel state a thread should render before the carried visibility
 * preference is persisted for that thread. Keeping this pure lets navigation
 * render one coherent state instead of painting the saved state first and
 * adopting the preference in an effect afterward.
 */
export function resolveFollowedRightPanelState(
  current: ThreadRightPanelState,
  preference: RightPanelVisibilityPreference,
  followsThreads: boolean,
): ThreadRightPanelState {
  if (!followsThreads || current.isOpen === preference.isOpen) return current;
  if (!preference.isOpen) return { ...current, isOpen: false };
  if (current.surfaces.length > 0) return { ...current, isOpen: true };
  if (preference.preferredKind === null) return current;
  if (preference.preferredKind === "preview") {
    return upsertSurface(current, browserSurface(null));
  }
  return upsertSurface(current, singletonSurface(preference.preferredKind));
}

/**
 * Runs a thread mutation and records the resulting visibility as the preference
 * to carry. Used by the mutators that represent a deliberate open/close, so
 * incidental changes (a terminal split, a file reveal) do not rewrite it.
 */
function updateThreadAndRememberVisibility(
  state: RightPanelStoreState,
  ref: ScopedThreadRef,
  updater: (current: ThreadRightPanelState) => ThreadRightPanelState,
): Pick<RightPanelStoreState, "byThreadKey" | "visibilityPreference"> {
  const threadKey = scopedThreadKey(ref);
  const byThreadKey = updateThread(state.byThreadKey, threadKey, updater);
  return {
    byThreadKey,
    visibilityPreference: visibilityPreferenceFrom(byThreadKey[threadKey] ?? EMPTY_THREAD_STATE),
  };
}

function normalizeRevealLine(line: number | undefined): number | null {
  if (line === undefined || !Number.isFinite(line)) return null;
  return Math.max(1, Math.trunc(line));
}

/**
 * Only rewrites `byThreadKey`. `visibilityPreference` is deliberately absent:
 * zustand shallow-merges the migration result over the initial state, so a
 * store upgrading from an older version simply starts from the default
 * preference, and at the current version this function does not run at all.
 */
export function migratePersistedRightPanelState(persistedState: unknown): {
  byThreadKey: Record<string, ThreadRightPanelState>;
} {
  if (!persistedState || typeof persistedState !== "object") {
    return { byThreadKey: {} };
  }
  const byThreadKey =
    "byThreadKey" in persistedState &&
    persistedState.byThreadKey &&
    typeof persistedState.byThreadKey === "object"
      ? Object.fromEntries(
          Object.entries(persistedState.byThreadKey as Record<string, ThreadRightPanelState>).map(
            ([threadKey, threadState]) => {
              const validThreadState =
                threadState && typeof threadState === "object" ? threadState : null;
              const surfaces = Array.isArray(validThreadState?.surfaces)
                ? validThreadState.surfaces.flatMap<RightPanelSurface>((surface) => {
                    if (surface.kind === "file") {
                      const revealLine =
                        typeof surface.revealLine === "number" &&
                        Number.isFinite(surface.revealLine)
                          ? Math.max(1, Math.trunc(surface.revealLine))
                          : null;
                      const revealRequestId =
                        typeof surface.revealRequestId === "number" &&
                        Number.isSafeInteger(surface.revealRequestId) &&
                        surface.revealRequestId >= 0
                          ? surface.revealRequestId
                          : 0;
                      return [{ ...surface, revealLine, revealRequestId }];
                    }
                    // Avi Code addition: keep `secondaryTabId` only when it is a
                    // string that differs from the primary tab; drop it otherwise.
                    if (surface.kind === "preview" && surface.resourceId !== null) {
                      const rawSecondary = (surface as { secondaryTabId?: unknown }).secondaryTabId;
                      if (typeof rawSecondary === "string" && rawSecondary !== surface.resourceId) {
                        return [{ ...surface, secondaryTabId: rawSecondary }];
                      }
                      const { secondaryTabId: _dropped, ...rest } = surface as typeof surface & {
                        secondaryTabId?: string;
                      };
                      return [rest];
                    }
                    if (surface.kind !== "terminal") return [surface];
                    if (
                      !("resourceId" in surface) ||
                      typeof surface.resourceId !== "string" ||
                      surface.id !== `terminal:${surface.resourceId}`
                    ) {
                      return [];
                    }
                    const terminalIds =
                      "terminalIds" in surface && Array.isArray(surface.terminalIds)
                        ? [
                            ...new Set(
                              surface.terminalIds.filter(
                                (terminalId): terminalId is string =>
                                  typeof terminalId === "string",
                              ),
                            ),
                          ]
                        : [surface.resourceId];
                    const activeTerminalId =
                      "activeTerminalId" in surface &&
                      typeof surface.activeTerminalId === "string" &&
                      terminalIds.includes(surface.activeTerminalId)
                        ? surface.activeTerminalId
                        : (terminalIds[0] ?? surface.resourceId);
                    return [
                      {
                        ...surface,
                        terminalIds: terminalIds.length > 0 ? terminalIds : [surface.resourceId],
                        activeTerminalId,
                      },
                    ];
                  })
                : [];
              const activeSurfaceId = surfaces.some(
                (surface) => surface.id === validThreadState?.activeSurfaceId,
              )
                ? (validThreadState?.activeSurfaceId ?? null)
                : null;
              const isOpen =
                typeof validThreadState?.isOpen === "boolean"
                  ? validThreadState.isOpen
                  : activeSurfaceId !== null;
              return [threadKey, { isOpen, surfaces, activeSurfaceId }];
            },
          ),
        )
      : {};
  return { byThreadKey };
}

export const useRightPanelStore = create<RightPanelStoreState>()(
  persist(
    (set) => ({
      byThreadKey: {},
      visibilityPreference: DEFAULT_VISIBILITY_PREFERENCE,
      open: (ref, kind) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) => {
            if (kind === "preview") {
              const existing = current.surfaces.find((surface) => surface.kind === "preview");
              return upsertSurface(current, existing ?? browserSurface(null));
            }
            return upsertSurface(current, singletonSurface(kind));
          }),
        ),
      openBrowser: (ref, tabId) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) => {
            const surface = browserSurface(tabId);
            const withoutPlaceholder = tabId
              ? current.surfaces.filter((entry) => entry.id !== "browser:new")
              : current.surfaces;
            return upsertSurface({ ...current, surfaces: withoutPlaceholder }, surface);
          }),
        ),
      openFile: (ref, relativePath, line, root) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) => {
            const withoutStandaloneExplorer = current.surfaces.filter(
              (surface) => surface.kind !== "files",
            );
            const surfaceId = fileSurfaceId(relativePath, root);
            const existing = withoutStandaloneExplorer.find(
              (surface): surface is Extract<RightPanelSurface, { kind: "file" }> =>
                surface.id === surfaceId && surface.kind === "file",
            );
            const surface = fileSurface(
              relativePath,
              root,
              normalizeRevealLine(line),
              (existing?.revealRequestId ?? 0) + 1,
            );
            return {
              isOpen: true,
              activeSurfaceId: surface.id,
              surfaces: existing
                ? withoutStandaloneExplorer.map((entry) =>
                    entry.id === surface.id ? surface : entry,
                  )
                : [...withoutStandaloneExplorer, surface],
            };
          }),
        ),
      rerootFile: (ref, surfaceId, root, relativePath) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const stale = current.surfaces.find(
              (surface): surface is Extract<RightPanelSurface, { kind: "file" }> =>
                surface.id === surfaceId && surface.kind === "file",
            );
            if (!stale) return current;
            const rerooted = fileSurface(
              relativePath,
              root,
              stale.revealLine,
              stale.revealRequestId + 1,
            );
            if (rerooted.id === stale.id) return current;
            // Reopening the same file in the same repo is already a tab; the one
            // that could not be read is the one to drop.
            const alreadyOpen = current.surfaces.some((surface) => surface.id === rerooted.id);
            const surfaces = alreadyOpen
              ? current.surfaces.filter((surface) => surface.id !== stale.id)
              : current.surfaces.map((surface) => (surface.id === stale.id ? rerooted : surface));
            return {
              ...current,
              surfaces,
              activeSurfaceId:
                current.activeSurfaceId === stale.id ? rerooted.id : current.activeSurfaceId,
            };
          }),
        })),
      openTerminal: (ref, terminalId) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) =>
            upsertSurface(current, terminalSurface(terminalId)),
          ),
        ),
      splitTerminal: (ref, surfaceId, terminalId, direction = "horizontal") =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => ({
            ...current,
            isOpen: true,
            activeSurfaceId: surfaceId,
            surfaces: current.surfaces.map((surface) => {
              if (surface.id !== surfaceId || surface.kind !== "terminal") return surface;
              const { splitDirection: _splitDirection, ...baseSurface } = surface;
              return {
                ...baseSurface,
                terminalIds: surface.terminalIds.includes(terminalId)
                  ? surface.terminalIds
                  : [...surface.terminalIds, terminalId],
                activeTerminalId: terminalId,
                ...(direction === "vertical" ? { splitDirection: "vertical" as const } : {}),
              };
            }),
          })),
        })),
      activateTerminal: (ref, surfaceId, terminalId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => ({
            ...current,
            activeSurfaceId: surfaceId,
            surfaces: current.surfaces.map((surface) =>
              surface.id === surfaceId &&
              surface.kind === "terminal" &&
              surface.terminalIds.includes(terminalId)
                ? { ...surface, activeTerminalId: terminalId }
                : surface,
            ),
          })),
        })),
      closeTerminal: (ref, surfaceId, terminalId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const surface = current.surfaces.find(
              (entry) => entry.id === surfaceId && entry.kind === "terminal",
            );
            if (!surface || surface.kind !== "terminal") return current;
            const terminalIds = surface.terminalIds.filter((id) => id !== terminalId);
            if (terminalIds.length === 0) {
              const index = current.surfaces.findIndex((entry) => entry.id === surfaceId);
              const surfaces = current.surfaces.filter((entry) => entry.id !== surfaceId);
              const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
              return {
                ...current,
                isOpen: surfaces.length > 0 && current.isOpen,
                surfaces,
                activeSurfaceId:
                  current.activeSurfaceId === surfaceId
                    ? (fallback?.id ?? null)
                    : current.activeSurfaceId,
              };
            }
            return {
              ...current,
              surfaces: current.surfaces.map((entry) =>
                entry.id === surfaceId && entry.kind === "terminal"
                  ? {
                      ...entry,
                      terminalIds,
                      activeTerminalId:
                        entry.activeTerminalId === terminalId
                          ? (terminalIds.at(-1) ?? terminalIds[0]!)
                          : entry.activeTerminalId,
                    }
                  : entry,
              ),
            };
          }),
        })),
      // Avi Code addition: split/unsplit two previews side by side. Incidental
      // like splitTerminal, so it does not rewrite the visibility preference.
      // Both tabs stay in the strip (Chrome-style); only a `secondaryTabId` link
      // on the primary records the pairing.
      splitPreview: (ref, surfaceId, secondaryTabId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const target = current.surfaces.find(
              (surface): surface is LivePreviewSurface =>
                surface.id === surfaceId &&
                surface.kind === "preview" &&
                surface.resourceId !== null,
            );
            const secondaryId = `browser:${secondaryTabId}` as const;
            const secondary = current.surfaces.find((surface) => surface.id === secondaryId);
            if (
              !target ||
              !secondary ||
              target.secondaryTabId !== undefined ||
              secondaryTabId === target.resourceId
            ) {
              return current;
            }
            // Link the primary, then move the secondary tab right after it so the
            // pair reads together in the strip. Neither tab is removed.
            const linked = current.surfaces.map((surface) =>
              surface.id === surfaceId && surface.kind === "preview" && surface.resourceId !== null
                ? { ...surface, secondaryTabId }
                : surface,
            );
            const withoutSecondary = linked.filter((surface) => surface.id !== secondaryId);
            const insertAt = withoutSecondary.findIndex((surface) => surface.id === surfaceId) + 1;
            const surfaces = [
              ...withoutSecondary.slice(0, insertAt),
              secondary,
              ...withoutSecondary.slice(insertAt),
            ];
            return { ...current, isOpen: true, activeSurfaceId: surfaceId, surfaces };
          }),
        })),
      unsplitPreview: (ref, surfaceId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const target = current.surfaces.find(
              (surface): surface is LivePreviewSurface =>
                surface.id === surfaceId &&
                surface.kind === "preview" &&
                surface.secondaryTabId !== undefined,
            );
            if (!target) return current;
            // Both tabs already exist; only drop the pairing link.
            const surfaces = current.surfaces.map((surface) =>
              surface.id === surfaceId &&
              isLivePreview(surface) &&
              surface.secondaryTabId !== undefined
                ? stripPreviewSecondary(surface)
                : surface,
            );
            return { ...current, surfaces };
          }),
        })),
      activateSurface: (ref, surfaceId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) =>
            current.surfaces.some((surface) => surface.id === surfaceId)
              ? { ...current, isOpen: true, activeSurfaceId: surfaceId }
              : current,
          ),
        })),
      closeSurface: (ref, surfaceId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const index = current.surfaces.findIndex((surface) => surface.id === surfaceId);
            if (index < 0) return current;
            // Avi Code addition: clearDangling drops a split link left by the pane
            // just closed, so the surviving pane renders whole.
            const surfaces = clearDanglingPreviewSecondaries(
              current.surfaces.filter((surface) => surface.id !== surfaceId),
            );
            if (current.activeSurfaceId !== surfaceId) {
              return { ...current, isOpen: surfaces.length > 0 && current.isOpen, surfaces };
            }
            const fallback = surfaces[Math.min(index, surfaces.length - 1)] ?? null;
            return {
              ...current,
              isOpen: surfaces.length > 0 && current.isOpen,
              surfaces,
              activeSurfaceId: fallback?.id ?? null,
            };
          }),
        })),
      closeOtherSurfaces: (ref, surfaceId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const surface = current.surfaces.find((entry) => entry.id === surfaceId);
            if (!surface || current.surfaces.length === 1) return current;
            return {
              ...current,
              isOpen: true,
              // Avi Code addition: the sole survivor keeps no dangling split link.
              surfaces: clearDanglingPreviewSecondaries([surface]),
              activeSurfaceId: surface.id,
            };
          }),
        })),
      closeSurfacesToRight: (ref, surfaceId) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const index = current.surfaces.findIndex((surface) => surface.id === surfaceId);
            if (index < 0 || index === current.surfaces.length - 1) return current;
            // Avi Code addition: a split whose second pane was to the right is now
            // dangling; clear it.
            const surfaces = clearDanglingPreviewSecondaries(current.surfaces.slice(0, index + 1));
            const activeStillExists = surfaces.some(
              (surface) => surface.id === current.activeSurfaceId,
            );
            return {
              ...current,
              surfaces,
              activeSurfaceId: activeStillExists ? current.activeSurfaceId : surfaceId,
            };
          }),
        })),
      closeAllSurfaces: (ref) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) =>
            current.surfaces.length === 0
              ? current
              : { ...current, isOpen: false, surfaces: [], activeSurfaceId: null },
          ),
        })),
      reconcileBrowserSurfaces: (ref, tabIds) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            const liveTabIds = new Set(tabIds);
            const validIds = new Set(tabIds.map((tabId) => `browser:${tabId}`));
            const nonBrowser = current.surfaces.filter((surface) => surface.kind !== "preview");
            const existingBrowser = current.surfaces
              .filter(
                (surface): surface is Extract<RightPanelSurface, { kind: "preview" }> =>
                  surface.kind === "preview" &&
                  surface.id !== "browser:new" &&
                  validIds.has(surface.id),
              )
              // Avi Code addition: auto-unsplit when the second tab's session is
              // gone, so a split never points at a dead pane.
              .map((surface): Extract<RightPanelSurface, { kind: "preview" }> => {
                if (
                  surface.secondaryTabId === undefined ||
                  liveTabIds.has(surface.secondaryTabId)
                ) {
                  return surface;
                }
                const { secondaryTabId: _gone, ...rest } = surface;
                return rest;
              });
            const knownIds = new Set(existingBrowser.map((surface) => surface.id));
            const added = tabIds
              .filter((tabId) => !knownIds.has(`browser:${tabId}`))
              .map((tabId) => browserSurface(tabId));
            const surfaces = [...nonBrowser, ...existingBrowser, ...added];
            const activeStillExists = surfaces.some(
              (surface) => surface.id === current.activeSurfaceId,
            );
            const fallbackBrowser = surfaces.find((surface) => surface.kind === "preview");
            return {
              ...current,
              surfaces,
              activeSurfaceId: activeStillExists
                ? current.activeSurfaceId
                : (fallbackBrowser?.id ?? surfaces[0]?.id ?? null),
            };
          }),
        })),
      reconcileFileSurfaces: (ref, workspaceAvailable) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) => {
            if (workspaceAvailable) return current;
            // Avi Code addition: a surface carrying its own root does not depend
            // on the thread's workspace, so losing that workspace must not close
            // a file the user opened from another repo.
            const surfaces = current.surfaces.filter(
              (surface) =>
                surface.kind !== "files" && (surface.kind !== "file" || surface.root !== undefined),
            );
            if (surfaces.length === current.surfaces.length) return current;
            const activeStillExists = surfaces.some(
              (surface) => surface.id === current.activeSurfaceId,
            );
            return {
              ...current,
              isOpen: surfaces.length > 0 ? current.isOpen : false,
              surfaces,
              activeSurfaceId: activeStillExists
                ? current.activeSurfaceId
                : (surfaces.at(-1)?.id ?? null),
            };
          }),
        })),
      show: (ref) =>
        set((state) => ({
          byThreadKey: updateThread(state.byThreadKey, scopedThreadKey(ref), (current) =>
            current.isOpen ? current : { ...current, isOpen: true },
          ),
        })),
      close: (ref) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) =>
            current.isOpen ? { ...current, isOpen: false } : current,
          ),
        ),
      toggleVisibility: (ref) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) => ({
            ...current,
            isOpen: !current.isOpen,
          })),
        ),
      toggle: (ref, kind) =>
        set((state) =>
          updateThreadAndRememberVisibility(state, ref, (current) => {
            const active = current.surfaces.find(
              (surface) => surface.id === current.activeSurfaceId,
            );
            if (current.isOpen && active?.kind === kind) {
              return { ...current, isOpen: false };
            }
            if (kind === "preview") {
              const existing = current.surfaces.find((surface) => surface.kind === "preview");
              return upsertSurface(current, existing ?? browserSurface(null));
            }
            return upsertSurface(current, singletonSurface(kind));
          }),
        ),
      adoptVisibilityPreference: (ref) =>
        set((state) => {
          const preference = state.visibilityPreference;
          const threadKey = scopedThreadKey(ref);
          const current = state.byThreadKey[threadKey] ?? EMPTY_THREAD_STATE;
          const resolved = resolveFollowedRightPanelState(current, preference, true);
          if (resolved === current) return state;
          return {
            byThreadKey: updateThread(state.byThreadKey, threadKey, () => resolved),
          };
        }),
      removeThread: (ref) =>
        set((state) => {
          const threadKey = scopedThreadKey(ref);
          if (!(threadKey in state.byThreadKey)) return state;
          const { [threadKey]: _removed, ...rest } = state.byThreadKey;
          return { byThreadKey: rest };
        }),
    }),
    {
      name: RIGHT_PANEL_STORAGE_KEY,
      version: RIGHT_PANEL_STORAGE_VERSION,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({
        byThreadKey: state.byThreadKey,
        visibilityPreference: state.visibilityPreference,
      }),
      migrate: migratePersistedRightPanelState,
    },
  ),
);

export function selectThreadRightPanelState(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): ThreadRightPanelState {
  if (!ref) return EMPTY_THREAD_STATE;
  return byThreadKey[scopedThreadKey(ref)] ?? EMPTY_THREAD_STATE;
}

export function selectActiveRightPanel(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelKind | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId)?.kind ?? null;
}

export function selectActiveRightPanelSurface(
  byThreadKey: Record<string, ThreadRightPanelState>,
  ref: ScopedThreadRef | null | undefined,
): RightPanelSurface | null {
  const state = selectThreadRightPanelState(byThreadKey, ref);
  if (!state.isOpen) return null;
  return state.surfaces.find((surface) => surface.id === state.activeSurfaceId) ?? null;
}
