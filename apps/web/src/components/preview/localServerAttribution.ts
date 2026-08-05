import type { ThreadId } from "@t3tools/contracts";

import { isWithinWorkspaceRoot } from "~/workspacePathMatch";
import type { PreviewableServer } from "./useDiscoveredLocalServers";

/**
 * Avi Code addition: says which detected local server is the one you came for.
 *
 * Opening the browser panel is nearly always about this project's dev server,
 * but the start page listed every listening localhost port as an
 * undifferentiated set, so four `node` servers looked identical. The app already
 * knew the answer and threw it away: the port scanner tags a server with the
 * terminal that started it, and the sidebar has used that for its badge all
 * along.
 *
 * The scanner no longer reports listeners Avi Code did not start, so `other` no
 * longer means "the machine's background noise". It means a server this app
 * started for a different project, which is worth showing and worth labelling as
 * someone else's. `recent` is the separate case of a URL you typed in yourself,
 * remembered per thread.
 */
export type LocalServerGroup = "this-thread" | "this-project" | "other" | "recent";

export interface LocalServerAttributionInput {
  readonly threadId: ThreadId | null;
  readonly projectRoot: string | null;
  readonly worktreePath: string | null;
}

export function attributeLocalServer(
  server: PreviewableServer,
  input: LocalServerAttributionInput,
): LocalServerGroup {
  const terminal = server.terminal;
  if (terminal && input.threadId && terminal.threadId === input.threadId) {
    return "this-thread";
  }

  // A URL configured on this project's own scripts belongs to it by definition,
  // even when nothing is listening yet.
  if (server.source === "configured") return "this-project";

  // Recently-seen URLs are this thread's own browsing history, not something
  // the scanner found, so no amount of path matching will place them better.
  if (server.source === "recent") return "recent";

  const owners = [terminal?.cwd, terminal?.worktreePath];
  const roots = [input.projectRoot, input.worktreePath];
  for (const owner of owners) {
    if (!owner) continue;
    for (const root of roots) {
      if (!root) continue;
      // Either direction counts: a worktree sits under the project, and a
      // terminal opened at the project root owns a server for a worktree of it.
      if (isWithinWorkspaceRoot(root, owner) || isWithinWorkspaceRoot(owner, root)) {
        return "this-project";
      }
    }
  }

  return "other";
}

export interface LocalServerSection {
  readonly group: LocalServerGroup;
  readonly title: string;
  readonly servers: readonly PreviewableServer[];
}

const SECTION_TITLES: Record<LocalServerGroup, string> = {
  "this-thread": "This thread",
  "this-project": "This project",
  other: "Other projects",
  recent: "Recently opened",
};

/**
 * Group the servers for display, most relevant first, dropping empty sections.
 * Order within a section is whatever the caller already sorted by.
 */
export function groupLocalServers(
  servers: readonly PreviewableServer[],
  input: LocalServerAttributionInput,
): LocalServerSection[] {
  const byGroup = new Map<LocalServerGroup, PreviewableServer[]>();
  for (const server of servers) {
    const group = attributeLocalServer(server, input);
    const existing = byGroup.get(group);
    if (existing) {
      existing.push(server);
    } else {
      byGroup.set(group, [server]);
    }
  }

  const order: LocalServerGroup[] = ["this-thread", "this-project", "other", "recent"];
  return order.flatMap((group) => {
    const groupServers = byGroup.get(group);
    if (!groupServers || groupServers.length === 0) return [];
    return [{ group, title: SECTION_TITLES[group], servers: groupServers }];
  });
}
