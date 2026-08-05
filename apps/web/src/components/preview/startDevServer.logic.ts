import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";

import { isWithinWorkspaceRoot } from "~/workspacePathMatch";
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

/**
 * Avi Code addition: the discovered server this thread should open, applying the
 * same worktree-vs-local scoping as {@link scopedDevServerGroups} directly to the
 * raw scanner results the sidebar has. Used to decide, per row, whether to offer
 * "open" (a server is already there) or "start" (none is).
 */
export function findScopedDevServer(
  servers: readonly DiscoveredLocalServer[],
  input: {
    readonly threadId: ThreadId;
    readonly projectRoot: string | null;
    readonly worktreePath: string | null;
  },
): DiscoveredLocalServer | null {
  // A server this exact thread started always wins, in either mode.
  const own = servers.find((server) => server.terminal?.threadId === input.threadId);
  if (own) return own;
  // A worktree thread is isolated, so a sibling's server is not its to reuse.
  if (input.worktreePath) return null;
  // A local thread shares the project directory, so reuse a server any thread in
  // the project started rather than spin up a duplicate.
  const roots = [input.projectRoot, input.worktreePath].filter((root) => root != null);
  return (
    servers.find((server) => {
      const owners = [server.terminal?.cwd, server.terminal?.worktreePath].filter(
        (owner) => owner != null,
      );
      return owners.some((owner) =>
        roots.some(
          (root) => isWithinWorkspaceRoot(root, owner) || isWithinWorkspaceRoot(owner, root),
        ),
      );
    }) ?? null
  );
}
