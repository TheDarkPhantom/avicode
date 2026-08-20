import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { type EnvironmentId, type ScopedThreadRef, ThreadId } from "@t3tools/contracts";

/**
 * The server only guarantees preview tab ids are unique within one process.
 * Desktop resources live across every connected environment, so they need a
 * stronger identity that also changes when a server process restarts.
 */
export function previewRuntimeTabId(
  threadRef: ScopedThreadRef,
  serverEpoch: string | null,
  tabId: string,
): string {
  return JSON.stringify([threadRef.environmentId, threadRef.threadId, serverEpoch, tabId]);
}

/**
 * Avi Code addition: inverse of {@link previewRuntimeTabId}. Recovers the thread
 * a runtime tab id belongs to, so a main-process event carrying a runtime tab id
 * (e.g. an open-new-tab request) can be routed to the right thread. Returns null
 * for anything that is not a well-formed runtime tab id.
 */
export function parsePreviewRuntimeTabId(
  runtimeTabId: string,
): { threadRef: ScopedThreadRef; serverEpoch: string | null; tabId: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(runtimeTabId);
  } catch {
    return null;
  }
  if (!Array.isArray(parsed) || parsed.length !== 4) return null;
  const [environmentId, threadId, serverEpoch, tabId] = parsed;
  if (
    typeof environmentId !== "string" ||
    typeof threadId !== "string" ||
    (serverEpoch !== null && typeof serverEpoch !== "string") ||
    typeof tabId !== "string"
  ) {
    return null;
  }
  return {
    threadRef: scopeThreadRef(environmentId as EnvironmentId, ThreadId.make(threadId)),
    serverEpoch,
    tabId,
  };
}

export function isCurrentPreviewRuntimeTab(
  threadRef: ScopedThreadRef,
  serverEpoch: string | null,
  tabId: string,
  runtimeTabId: string,
): boolean {
  return previewRuntimeTabId(threadRef, serverEpoch, tabId) === runtimeTabId;
}
