/**
 * Avi Code addition: the vocabulary and the fold for closing a provider
 * question whose callback is gone.
 *
 * A pending user-input request is durable on one side and ephemeral on the
 * other: the question is an event-sourced `user-input.requested` activity, but
 * the continuation the provider is blocked on is an in-memory `Deferred` owned
 * by one adapter session. Stop that session — an app restart, an explicit stop,
 * a crash — and the question survives while its answer path does not. Upstream
 * discovered that only when the user answered, and reported it as a red
 * "Provider user input response failed".
 *
 * Instead the request is *closed*, with the same `user-input.resolved` activity
 * kind a real answer produces, so every consumer that already clears on it
 * (decider's hasOpenBlockingRequest, ProjectionPipeline's pending accounting,
 * the web's derivePendingUserInputs, AgentAwarenessRelay) clears with no new
 * failure-detail strings to keep in sync. `expired: true` in the payload is
 * what tells a client this was not an answer.
 */

/** Activity summary for a question the provider closed rather than answered. */
export const USER_INPUT_EXPIRED_SUMMARY = "Question expired";

/** Expandable body for that row. Read by a user, not matched by code. */
export const USER_INPUT_EXPIRED_DETAIL =
  "The provider session ended before this question was answered. Send again to continue.";

interface ClosureActivity {
  readonly kind: string;
  readonly payload: unknown;
}

// Mirrors decider.ts's isStaleRequestFailureDetail for the user-input half.
// Historical threads carry these rows from before questions were closed
// properly, and a boot sweep must not reopen what they already settled.
function isStaleUserInputFailureDetail(payload: Record<string, unknown> | null): boolean {
  const detail = typeof payload?.detail === "string" ? payload.detail.toLowerCase() : null;
  if (detail === null) return false;
  return (
    detail.includes("stale pending user-input request") ||
    detail.includes("unknown pending user-input request") ||
    detail.includes("unknown pending user input request") ||
    detail.includes("unknown pending codex user input request")
  );
}

/**
 * Request ids with a `user-input.requested` and no later close, in the order
 * they were opened. Duplicate ids collapse to one entry, so a caller can
 * dispatch one closure per id without deduplicating.
 *
 * Takes activities already ordered by the projector; it does not sort, matching
 * how decider.ts and ProjectionPipeline read the same stream.
 */
export function deriveOpenUserInputRequestIds(
  activities: ReadonlyArray<ClosureActivity>,
): ReadonlyArray<string> {
  const openRequestIds = new Set<string>();
  for (const activity of activities) {
    const payload =
      typeof activity.payload === "object" && activity.payload !== null
        ? (activity.payload as Record<string, unknown>)
        : null;
    const requestId = typeof payload?.requestId === "string" ? payload.requestId : null;
    if (requestId === null) continue;
    if (activity.kind === "user-input.requested") {
      openRequestIds.add(requestId);
    } else if (activity.kind === "user-input.resolved") {
      openRequestIds.delete(requestId);
    } else if (
      activity.kind === "provider.user-input.respond.failed" &&
      isStaleUserInputFailureDetail(payload)
    ) {
      openRequestIds.delete(requestId);
    }
  }
  return [...openRequestIds];
}
