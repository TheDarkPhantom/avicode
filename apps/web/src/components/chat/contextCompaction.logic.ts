import type { ChatMessage, SessionPhase, Thread } from "../../types";

/**
 * Avi Code addition (upstream #9293): client side of `/compact`.
 *
 * A user message of exactly `/compact` with no attachments asks the server to
 * compact the provider context instead of prompting. Mirrors the server's
 * predicate in `apps/server/src/orchestration/compactCommand.ts`; the two must
 * agree or the client would miss a compaction the server is running.
 */
export function isCompactCommandMessage(message: {
  readonly role: string;
  readonly text: string;
  readonly attachments?: ReadonlyArray<unknown> | undefined;
}): boolean {
  return (
    message.role === "user" &&
    (message.attachments?.length ?? 0) === 0 &&
    message.text.trim().toLowerCase() === "/compact"
  );
}

function activityRequestId(payload: unknown): unknown {
  return typeof payload === "object" && payload !== null
    ? (payload as { readonly requestId?: unknown }).requestId
    : undefined;
}

/**
 * The newest `provider.turn.start.failed` activity for a message, if any. The
 * server reports a failed compaction, or a queued message it dropped, this way
 * instead of changing the session, so it is the only acknowledgement a send
 * may get.
 */
export function latestTurnStartFailureId(
  activeThread: Pick<Thread, "activities"> | undefined,
  messageId: ChatMessage["id"] | null,
): string | null {
  if (messageId === null) return null;
  return (
    activeThread?.activities.findLast(
      (activity) =>
        activity.kind === "provider.turn.start.failed" &&
        activityRequestId(activity.payload) === messageId,
    )?.id ?? null
  );
}

/**
 * Whether a `/compact` request is still running. The compaction message is
 * the optimistic one while the send is in flight, otherwise the newest
 * projected one; it settles when a compaction or failure activity names it.
 */
export function deriveIsCompacting(input: {
  readonly isSendBusy: boolean;
  readonly phase: SessionPhase;
  readonly optimisticUserMessages: ReadonlyArray<ChatMessage>;
  readonly activeThread: Pick<Thread, "messages" | "activities"> | undefined;
  readonly latestTurn: Pick<NonNullable<Thread["latestTurn"]>, "requestedAt" | "state"> | null;
}): boolean {
  if (!input.isSendBusy && input.phase !== "connecting" && input.phase !== "running") {
    return false;
  }
  const optimistic = input.optimisticUserMessages.at(-1);
  const message =
    input.isSendBusy && optimistic !== undefined && isCompactCommandMessage(optimistic)
      ? optimistic
      : input.activeThread?.messages.findLast(isCompactCommandMessage);
  if (message === undefined) return false;

  // A turn requested after the compaction message means it already finished.
  const latestTurn = input.latestTurn;
  const requestIsActive =
    message.createdAt > (latestTurn?.requestedAt ?? message.createdAt) ||
    (latestTurn?.state === "running" && message.createdAt === latestTurn.requestedAt);
  if (!requestIsActive) return false;

  const settled =
    latestTurnStartFailureId(input.activeThread, message.id) !== null ||
    (input.activeThread?.activities.some(
      (activity) =>
        activity.kind === "context-compaction" &&
        activityRequestId(activity.payload) === message.id,
    ) ??
      false);
  return !settled;
}

/** Why the compact action is disabled, for its tooltip, or null when it is enabled. */
export function deriveCompactDisabledReason(input: {
  readonly unavailable: boolean;
  readonly hasProject: boolean;
  readonly providerSupportsCompaction: boolean;
  readonly hasConversation: boolean;
}): string | null {
  if (!input.unavailable) return null;
  if (!input.hasProject) return "Choose a project before compacting";
  if (!input.providerSupportsCompaction) return "Compaction is unavailable for this provider";
  if (!input.hasConversation) return "Nothing to compact yet";
  return "Compacting is unavailable right now";
}
