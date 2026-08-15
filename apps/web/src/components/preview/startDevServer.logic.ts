import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";

import { isWithinWorkspaceRoot } from "~/workspacePathMatch";

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
