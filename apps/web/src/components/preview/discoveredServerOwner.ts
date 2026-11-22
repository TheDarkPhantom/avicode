import type { DiscoveredLocalServer, ThreadId } from "@t3tools/contracts";

/**
 * Avi Code addition: a discovered server is owned by the terminal or the agent
 * that started it. These read either owner, so callers that used to look only at
 * `terminal` also see servers an agent started.
 */
type OwnedServer = Pick<DiscoveredLocalServer, "terminal" | "agent">;

/** The thread whose terminal or agent started this server, if any. */
export function discoveredServerThreadId(server: OwnedServer): ThreadId | null {
  return server.terminal?.threadId ?? server.agent?.threadId ?? null;
}

/** The folders the server's owner works in, for matching it to a project. */
export function discoveredServerOwnerFolders(server: OwnedServer): string[] {
  return [server.terminal?.cwd, server.terminal?.worktreePath, server.agent?.cwd].filter(
    (folder): folder is string => folder != null,
  );
}
