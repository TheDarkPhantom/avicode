import type { LocalServerGroup, LocalServerSection } from "./localServerAttribution";

/**
 * Avi Code addition: decides whether this thread still needs a dev server started.
 *
 * A worktree thread runs in its own directory, so only a server this exact thread
 * started counts as "already there" — a sibling thread's server lives somewhere
 * else. A local thread shares the project directory with every other local thread,
 * so any server the project already has is the one to reuse rather than duplicate.
 * That split is the whole reason the button behaves differently in the two modes.
 */
export function scopedDevServerGroups(worktreePath: string | null): ReadonlySet<LocalServerGroup> {
  return worktreePath
    ? new Set<LocalServerGroup>(["this-thread"])
    : new Set<LocalServerGroup>(["this-thread", "this-project"]);
}

export function hasScopedDevServer(
  sections: readonly LocalServerSection[],
  worktreePath: string | null,
): boolean {
  const relevant = scopedDevServerGroups(worktreePath);
  return sections.some((section) => relevant.has(section.group) && section.servers.length > 0);
}

/**
 * Offer to start a dev server only when the thread can start one (a primary action
 * exists) and none is already reachable in its scope.
 */
export function shouldOfferStartDevServer(input: {
  readonly sections: readonly LocalServerSection[];
  readonly worktreePath: string | null;
  readonly canStart: boolean;
}): boolean {
  return input.canStart && !hasScopedDevServer(input.sections, input.worktreePath);
}
