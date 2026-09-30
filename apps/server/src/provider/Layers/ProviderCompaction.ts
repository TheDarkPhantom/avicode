/**
 * ProviderCompaction - manual context compaction (`/compact`) for ProviderService.
 *
 * Avi Code addition, ported from upstream pingdotgg/t3code#9293 and #10112.
 * Lives beside ProviderService rather than inside it so the service keeps a
 * handful of call sites: its runtime event funnel routes through
 * `routeRuntimeEvent`, and session start/stop clear stale state.
 *
 * One compaction runs per thread at a time. Adapters declare how they compact:
 * - "native": call the adapter's start effect, then wait for the provider to
 *   report a compacted `thread.state.changed`.
 * - "slash-command": send the provider's own command as a turn and wait for
 *   that turn to settle. A turn that completes without its own compacted
 *   event gets one synthesized, so the timeline always records the outcome.
 * - "unsupported": fail loudly.
 *
 * Every compacted event raised by a requested compaction carries the request
 * id (the `/compact` message id), which is how the projection and the web
 * client tie the result back to the message that asked for it.
 *
 * @module ProviderCompaction
 */
import {
  EventId,
  type MessageId,
  type ProviderDriverKind,
  type ProviderInstanceId,
  type ProviderRuntimeEvent,
  type ProviderSendTurnInput,
  RuntimeRequestId,
  type ThreadId,
  type ProviderTurnStartResult,
  type TurnId,
} from "@t3tools/contracts";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";

import { increment, providerRuntimeEventsTotal } from "../../observability/Metrics.ts";
import {
  type ProviderAdapterError,
  ProviderAdapterRequestError,
  type ProviderServiceError,
  ProviderValidationError,
} from "../Errors.ts";
import type { ProviderCompaction } from "../Services/ProviderAdapter.ts";

/** How long a manual context compaction may run before ProviderService gives up on it. */
export const COMPACTION_COMPLETION_TIMEOUT = "10 minutes";

interface PendingCompaction {
  readonly completion: Deferred.Deferred<string>;
  readonly native: boolean;
  readonly providerInstanceId: ProviderInstanceId;
  readonly requestId: MessageId | undefined;
  /** Fallback events that arrived before `sendTurn` returned the turn id to match. */
  readonly earlyEvents: ProviderRuntimeEvent[];
  compactedEventObserved: boolean;
  expectedTurnId: TurnId | undefined;
}

export interface RunCompactionInput {
  readonly threadId: ThreadId;
  readonly provider: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId;
  readonly compaction: ProviderCompaction<ProviderAdapterError>;
  readonly modelSelection: ProviderSendTurnInput["modelSelection"] | undefined;
  readonly requestId: MessageId | undefined;
  /** ProviderService.sendTurn, used by slash-command compaction. */
  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, ProviderServiceError>;
}

const isCompactedEvent = (
  event: ProviderRuntimeEvent,
): event is Extract<ProviderRuntimeEvent, { readonly type: "thread.state.changed" }> =>
  event.type === "thread.state.changed" && event.payload.state === "compacted";

const compactionTerminal = (event: ProviderRuntimeEvent): string | null =>
  event.type === "turn.completed"
    ? event.payload.state
    : event.type === "runtime.error" || event.type === "turn.aborted"
      ? event.type
      : null;

const withCompactionRequestId = (
  event: ProviderRuntimeEvent,
  pending: PendingCompaction,
): ProviderRuntimeEvent =>
  pending.requestId === undefined
    ? event
    : { ...event, requestId: RuntimeRequestId.make(String(pending.requestId)) };

export const makeProviderCompaction = (deps: {
  readonly publishRuntimeEvent: (event: ProviderRuntimeEvent) => Effect.Effect<void>;
}) => {
  const { publishRuntimeEvent } = deps;
  const pendingCompactions = new Map<ThreadId, PendingCompaction>();
  // A native compaction that timed out may still finish; block retries until
  // it reports in or the session restarts, so two never run at once.
  const timedOutNativeCompactions = new Set<ThreadId>();

  const settleCompaction = (threadId: ThreadId, pending: PendingCompaction, terminal: string) =>
    Effect.gen(function* () {
      if (pendingCompactions.get(threadId) !== pending) return false;
      pendingCompactions.delete(threadId);
      yield* Deferred.succeed(pending.completion, terminal);
      return true;
    });

  const processFallbackCompactionEvent = (
    pending: PendingCompaction,
    event: ProviderRuntimeEvent,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (pendingCompactions.get(event.threadId) !== pending) {
        yield* publishRuntimeEvent(event);
        return;
      }
      const matchesTurn = event.turnId !== undefined && event.turnId === pending.expectedTurnId;
      if (matchesTurn && isCompactedEvent(event)) {
        pending.compactedEventObserved = true;
        yield* publishRuntimeEvent(withCompactionRequestId(event, pending));
        return;
      }
      yield* publishRuntimeEvent(event);
      const terminal = compactionTerminal(event);
      if (!matchesTurn || terminal === null) return;
      const settled = yield* settleCompaction(event.threadId, pending, terminal);
      if (!settled || terminal !== "completed" || pending.compactedEventObserved) return;
      const compactedEvent = {
        ...event,
        eventId: EventId.make(`${event.eventId}:context-compaction`),
        type: "thread.state.changed",
        payload: {
          state: "compacted",
          detail: { source: "provider-native-command" },
        },
        ...(pending.requestId !== undefined
          ? { requestId: RuntimeRequestId.make(String(pending.requestId)) }
          : {}),
      } satisfies ProviderRuntimeEvent;
      yield* increment(providerRuntimeEventsTotal, {
        provider: compactedEvent.provider,
        eventType: compactedEvent.type,
      });
      yield* publishRuntimeEvent(compactedEvent);
    });

  /**
   * The runtime event funnel. Events for threads without a compaction in
   * flight pass straight through; the rest settle or tag the pending request.
   */
  const routeRuntimeEvent = (
    sourceInstanceId: ProviderInstanceId,
    event: ProviderRuntimeEvent,
  ): Effect.Effect<void> =>
    Effect.gen(function* () {
      if (isCompactedEvent(event) && timedOutNativeCompactions.delete(event.threadId)) {
        yield* publishRuntimeEvent(event);
        return;
      }
      const pending = pendingCompactions.get(event.threadId);
      if (!pending || pending.providerInstanceId !== sourceInstanceId) {
        yield* publishRuntimeEvent(event);
        return;
      }
      if (pending.native) {
        const compacted = isCompactedEvent(event);
        const terminal = compacted ? "completed" : compactionTerminal(event);
        yield* publishRuntimeEvent(compacted ? withCompactionRequestId(event, pending) : event);
        if (terminal !== null) yield* settleCompaction(event.threadId, pending, terminal);
        return;
      }
      if (
        pending.expectedTurnId === undefined &&
        event.turnId !== undefined &&
        (isCompactedEvent(event) || compactionTerminal(event) !== null)
      ) {
        pending.earlyEvents.push(event);
        return;
      }
      yield* processFallbackCompactionEvent(pending, event);
    });

  const run = Effect.fn("ProviderCompaction.run")(function* (input: RunCompactionInput) {
    const { compaction, threadId } = input;
    if (compaction.type === "unsupported") {
      return yield* new ProviderValidationError({
        operation: "ProviderService.compactThread",
        issue: `Provider '${input.provider}' does not support context compaction.`,
      });
    }
    if (compaction.type === "native" && timedOutNativeCompactions.has(threadId)) {
      return yield* new ProviderAdapterRequestError({
        provider: input.provider,
        method: "thread/compact",
        detail:
          "The previous context compaction may still be running. Restart the provider session before retrying.",
      });
    }
    // Made before the in-progress check so no yield separates the check from the claim.
    const completion = yield* Deferred.make<string>();
    if (pendingCompactions.has(threadId)) {
      return yield* new ProviderAdapterRequestError({
        provider: input.provider,
        method: "thread/compact",
        detail: "Context compaction is already in progress.",
      });
    }
    const pending: PendingCompaction = {
      completion,
      native: compaction.type === "native",
      providerInstanceId: input.instanceId,
      requestId: input.requestId,
      earlyEvents: [],
      compactedEventObserved: false,
      expectedTurnId: undefined,
    };
    pendingCompactions.set(threadId, pending);
    const clearPending = Effect.sync(() => {
      if (pendingCompactions.get(threadId) === pending) {
        pendingCompactions.delete(threadId);
      }
    });

    const awaitNative = (start: Effect.Effect<void, ProviderAdapterError>) =>
      start.pipe(
        Effect.andThen(Deferred.await(pending.completion)),
        Effect.timeout(COMPACTION_COMPLETION_TIMEOUT),
        Effect.catchTag("TimeoutError", (cause) =>
          Effect.sync(() => void timedOutNativeCompactions.add(threadId)).pipe(
            Effect.andThen(
              Effect.fail(
                new ProviderAdapterRequestError({
                  provider: input.provider,
                  method: "thread/compact",
                  detail: `Provider did not report completed context compaction within ${COMPACTION_COMPLETION_TIMEOUT}.`,
                  cause,
                }),
              ),
            ),
          ),
        ),
      );

    const awaitSlashCommand = (command: string) =>
      Effect.gen(function* () {
        const turn = yield* input
          .sendTurn({
            threadId,
            input: command,
            ...(input.modelSelection !== undefined ? { modelSelection: input.modelSelection } : {}),
          })
          .pipe(
            Effect.onError(() =>
              Effect.forEach(pending.earlyEvents.splice(0), publishRuntimeEvent, {
                discard: true,
              }),
            ),
          );
        pending.expectedTurnId = turn.turnId;
        for (const earlyEvent of pending.earlyEvents.splice(0)) {
          yield* processFallbackCompactionEvent(pending, earlyEvent);
        }
        return yield* Deferred.await(pending.completion).pipe(
          Effect.timeout(COMPACTION_COMPLETION_TIMEOUT),
          Effect.mapError(
            (cause) =>
              new ProviderAdapterRequestError({
                provider: input.provider,
                method: "turn/start",
                detail: `Provider did not finish context compaction within ${COMPACTION_COMPLETION_TIMEOUT}.`,
                cause,
              }),
          ),
        );
      });

    const terminal = yield* (
      compaction.type === "native"
        ? awaitNative(compaction.start(threadId, input.modelSelection))
        : awaitSlashCommand(compaction.command)
    ).pipe(Effect.ensuring(clearPending));
    if (terminal !== "completed") {
      return yield* new ProviderAdapterRequestError({
        provider: input.provider,
        method: compaction.type === "native" ? "thread/compact" : "turn/start",
        detail: `Context compaction ended with ${terminal}.`,
      });
    }
  });

  return {
    routeRuntimeEvent,
    run,
    /** A fresh session cannot still be running an old compaction. */
    onSessionStarted: (threadId: ThreadId) =>
      Effect.sync(() => void timedOutNativeCompactions.delete(threadId)),
    /** Stopping the session ends whatever compaction it was running. */
    onSessionStopped: (threadId: ThreadId) =>
      Effect.gen(function* () {
        const pending = pendingCompactions.get(threadId);
        if (pending !== undefined) {
          yield* settleCompaction(threadId, pending, "turn.aborted");
        }
        timedOutNativeCompactions.delete(threadId);
      }),
  };
};
