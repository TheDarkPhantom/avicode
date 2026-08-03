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
 * Servers started outside an Avi Code terminal carry no owner at all and stay
 * in `other`. They are never hidden: a dev server you started yourself is still
 * one you want to open.
 */
export type LocalServerGroup = "this-thread" | "this-project" | "other";

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

/**
 * Whether "Other local servers" should start open.
 *
 * A developer machine runs a lot of unrelated listeners — vendor tools, VPN
 * clients, game clients — and the scanner cannot tell them from a dev server by
 * port or process name. Collapsing them is what makes this thread's own server
 * the thing you see. But collapsing the only section there is would leave an
 * apparently empty panel, so it opens when nothing more relevant exists.
 */
export function shouldExpandOtherServers(sections: readonly LocalServerSection[]): boolean {
  return !sections.some((section) => section.group !== "other");
}

const SECTION_TITLES: Record<LocalServerGroup, string> = {
  "this-thread": "This thread",
  "this-project": "This project",
  other: "Other local servers",
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

  const order: LocalServerGroup[] = ["this-thread", "this-project", "other"];
  return order.flatMap((group) => {
    const groupServers = byGroup.get(group);
    if (!groupServers || groupServers.length === 0) return [];
    return [{ group, title: SECTION_TITLES[group], servers: groupServers }];
  });
}
