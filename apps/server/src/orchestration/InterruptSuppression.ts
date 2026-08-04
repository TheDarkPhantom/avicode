/**
 * Avi Code addition: remembers that a user asked to stop a turn, so the errors
 * that stop produces are not reported as failures.
 *
 * Pressing Stop is a normal thing to do, but every provider expresses an abort
 * differently: OpenCode pushes a `session.error` carrying `MessageAbortedError`,
 * codex can report the cancelled request as an `error` notification, Cursor's
 * ACP prompt RPC can fail outright, and Grok deliberately fails a prompt it
 * just cancelled cleanly. Each of those reaches `ProviderRuntimeIngestion` and
 * writes `session.lastError`, which lights up the thread error banner, a
 * destructive work-log row, a red sidebar status, and an "Agent failed" push
 * notification — all for something the user did on purpose.
 *
 * Classifying the abort correctly inside each adapter is the real fix and is
 * worth doing per provider, but there are five of them and a sixth will arrive.
 * This is the backstop: between the interrupt and the thread's next turn, error
 * classification for that thread is suppressed.
 *
 * Scoped to the thread and cleared by the next turn, not by a timer — a stale
 * suppression would silence a genuine error, so it must end on a definite
 * event rather than on a guess about how long an abort takes.
 */
import type { ThreadId } from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Ref from "effect/Ref";

export interface InterruptSuppressionShape {
  /** Record that this thread's current turn is being stopped on purpose. */
  readonly mark: (threadId: ThreadId) => Effect.Effect<void>;
  /** Whether a provider error for this thread is a consequence of that stop. */
  readonly isSuppressed: (threadId: ThreadId) => Effect.Effect<boolean>;
  /** End suppression. Called when the thread starts or finishes a turn. */
  readonly clear: (threadId: ThreadId) => Effect.Effect<void>;
}

export class InterruptSuppression extends Context.Service<
  InterruptSuppression,
  InterruptSuppressionShape
>()("t3/orchestration/InterruptSuppression") {}

export const makeInterruptSuppression = Effect.gen(function* () {
  const interruptedThreadIds = yield* Ref.make(new Set<ThreadId>());

  return {
    mark: (threadId) =>
      Ref.update(interruptedThreadIds, (current) => {
        if (current.has(threadId)) return current;
        const next = new Set(current);
        next.add(threadId);
        return next;
      }),
    isSuppressed: (threadId) =>
      Ref.get(interruptedThreadIds).pipe(Effect.map((current) => current.has(threadId))),
    clear: (threadId) =>
      Ref.update(interruptedThreadIds, (current) => {
        if (!current.has(threadId)) return current;
        const next = new Set(current);
        next.delete(threadId);
        return next;
      }),
  } satisfies InterruptSuppressionShape;
});

export const InterruptSuppressionLive = Layer.effect(
  InterruptSuppression,
  makeInterruptSuppression,
);
