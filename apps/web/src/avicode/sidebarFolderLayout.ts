import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { msg } from "gt-react";

import {
  resolveSidebarFolderDot,
  resolveThreadLastVisitedAt,
  resolveThreadStatusPill,
} from "~/components/Sidebar.logic";
import type { SidebarThreadSummary } from "~/types";
import { type SidebarFolder, sidebarFolderProjectKeys } from "./sidebarFolders";

type StatusThread = Parameters<typeof resolveThreadStatusPill>[0]["thread"] &
  Parameters<typeof resolveSidebarFolderDot>[0][number];

export type SidebarFolderThread = StatusThread & Pick<SidebarThreadSummary, "environmentId" | "id">;

/** One of upstream's boring-sidebar project shelves. */
export interface SidebarFolderShelf {
  readonly group: {
    readonly projectKey: string;
    readonly memberProjects: ReadonlyArray<{ readonly physicalProjectKey: string }>;
  };
  readonly collapsed: boolean;
  readonly threads: readonly SidebarFolderThread[];
  readonly hiddenThreads: readonly SidebarFolderThread[];
}

export type SidebarFolderDot = ReturnType<typeof resolveSidebarFolderDot>;

export type SidebarFolderLayoutEntry<TShelf> =
  | {
      readonly kind: "folder";
      readonly folder: SidebarFolder;
      /** Threads the collapsed folder hides, for its count. */
      readonly hiddenThreadCount: number;
      readonly dot: SidebarFolderDot;
    }
  | { readonly kind: "shelf"; readonly shelf: TShelf };

export interface SidebarFolderLayout<TShelf> {
  readonly entries: ReadonlyArray<SidebarFolderLayoutEntry<TShelf>>;
  /** The shelves still drawn, in drawn order. */
  readonly shelves: readonly TShelf[];
}

export interface SidebarFolderLayoutInput {
  readonly folders: readonly SidebarFolder[];
  readonly showAttentionUnderCollapsed: boolean;
  /** Local visit watermarks, for unread and failure state on older servers. */
  readonly localLastVisitedAtById: Readonly<Record<string, string>>;
  /** The open thread stays visible under a collapsed folder, as under a closed shelf. */
  readonly routeThreadKey: string | null;
  /** A project filter shows the chosen projects plainly, without folders. */
  readonly scoped: boolean;
}

const ATTENTION_LABELS = new Set<string>([
  msg("Pending Approval"),
  msg("Awaiting Input"),
  msg("Failed"),
  msg("Plan Ready"),
]);

function threadKey(thread: SidebarFolderThread): string {
  return scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));
}

function withLocalVisit<TThread extends SidebarFolderThread>(
  thread: TThread,
  localLastVisitedAtById: Readonly<Record<string, string>>,
): TThread {
  return {
    ...thread,
    lastVisitedAt: resolveThreadLastVisitedAt(
      thread.lastVisitedAt,
      localLastVisitedAtById[threadKey(thread)],
    ),
  };
}

/** Waiting on approval or input, a failed run, or a plan ready to act on. */
export function sidebarThreadNeedsAttention(thread: StatusThread): boolean {
  const pill = resolveThreadStatusPill({ thread });
  return pill !== null && ATTENTION_LABELS.has(pill.label);
}

/**
 * Visible folders in saved order, each followed by its shelves, then shelves in no
 * folder in upstream order. A hidden folder drops with its shelves; a collapsed one
 * keeps the open thread and, when the setting is on, threads that need attention.
 */
export function layoutSidebarFolders<TShelf extends SidebarFolderShelf>(
  shelves: readonly TShelf[] | null,
  input: SidebarFolderLayoutInput,
): SidebarFolderLayout<TShelf> | null {
  if (shelves === null) return null;
  if (input.folders.length === 0 || input.scoped) {
    return { entries: shelves.map((shelf) => ({ kind: "shelf", shelf })), shelves };
  }
  const folderIndexByKey = new Map<string, number>();
  input.folders.forEach((folder, index) => {
    for (const key of folder.projectKeys) {
      if (!folderIndexByKey.has(key)) folderIndexByKey.set(key, index);
    }
  });
  const shelvesByFolder = input.folders.map((): TShelf[] => []);
  const ungrouped: TShelf[] = [];
  for (const shelf of shelves) {
    const index = sidebarFolderProjectKeys(shelf.group)
      .map((key) => folderIndexByKey.get(key))
      .find((candidate) => candidate !== undefined);
    if (index === undefined) ungrouped.push(shelf);
    else shelvesByFolder[index]!.push(shelf);
  }

  const keepVisible = (thread: SidebarFolderThread) =>
    threadKey(thread) === input.routeThreadKey ||
    (input.showAttentionUnderCollapsed &&
      sidebarThreadNeedsAttention(withLocalVisit(thread, input.localLastVisitedAtById)));

  const entries: SidebarFolderLayoutEntry<TShelf>[] = [];
  const drawn: TShelf[] = [];
  const draw = (shelf: TShelf) => {
    entries.push({ kind: "shelf", shelf });
    drawn.push(shelf);
  };
  input.folders.forEach((folder, index) => {
    if (folder.hidden) return;
    const members = shelvesByFolder[index]!;
    if (!folder.collapsed) {
      entries.push({ kind: "folder", folder, hiddenThreadCount: 0, dot: null });
      members.forEach(draw);
      return;
    }
    const hidden: SidebarFolderThread[] = [];
    const kept: TShelf[] = [];
    for (const shelf of members) {
      const threads = shelf.threads.filter(keepVisible);
      hidden.push(...shelf.threads.filter((thread) => !threads.includes(thread)));
      hidden.push(...shelf.hiddenThreads);
      // Same shelf with fewer rows; its own fields keep their types.
      if (threads.length > 0) kept.push({ ...shelf, threads } as TShelf);
    }
    entries.push({
      kind: "folder",
      folder,
      hiddenThreadCount: hidden.length,
      dot: resolveSidebarFolderDot(
        hidden.map((thread) => withLocalVisit(thread, input.localLastVisitedAtById)),
      ),
    });
    kept.forEach(draw);
  });
  ungrouped.forEach(draw);
  return { entries, shelves: drawn };
}
