/**
 * Avi Code addition: session liveness bookkeeping for the idle reaper.
 *
 * `ProviderService` feeds every canonical runtime event through `observe`.
 * Two things come out of it:
 *
 * - Activity (turn completion, task lifecycle) refreshes the session binding's
 *   `lastSeenAt`, so the reaper's idle clock starts when work stops rather than
 *   when the user last sent a message. Touches are throttled per thread.
 * - Tasks the provider started but has not reported finished are tracked per
 *   thread. `hasOpenTasks` lets the reaper keep a session alive while a
 *   backgrounded command or subagent is still running; stopping the session
 *   would kill that work and the agent would never resume.
 *
 * State is in memory on purpose: a server restart already ends every provider
 * process, and with it every task.
 */
import type { ProviderRuntimeEvent, ThreadId } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";

import type { ProviderSessionDirectoryShape } from "../Services/ProviderSessionDirectory.ts";

export const SESSION_ACTIVITY_TOUCH_THROTTLE_MS = 60 * 1000;

export function makeProviderSessionActivity(input: {
  readonly directory: ProviderSessionDirectoryShape;
  readonly touchThrottleMs?: number;
}) {
  const touchThrottleMs = input.touchThrottleMs ?? SESSION_ACTIVITY_TOUCH_THROTTLE_MS;
  const openTasks = new Map<ThreadId, Set<string>>();
  const lastTouchedAt = new Map<ThreadId, number>();

  const touch = Effect.fn("providerSessionActivity.touch")(function* (threadId: ThreadId) {
    const now = yield* Clock.currentTimeMillis;
    const previous = lastTouchedAt.get(threadId);
    if (previous !== undefined && now - previous < touchThrottleMs) {
      return;
    }
    lastTouchedAt.set(threadId, now);
    const binding = Option.getOrUndefined(yield* input.directory.getBinding(threadId));
    // Never resurrect a stopped or unknown binding: a late event must not
    // make a dead session look live.
    if (!binding || binding.status === "stopped" || binding.providerInstanceId === undefined) {
      return;
    }
    yield* input.directory.upsert({
      threadId,
      provider: binding.provider,
      providerInstanceId: binding.providerInstanceId,
    });
  });

  const trackTask = (event: ProviderRuntimeEvent) => {
    if (event.type === "task.started") {
      const tasks = openTasks.get(event.threadId) ?? new Set<string>();
      tasks.add(event.payload.taskId);
      openTasks.set(event.threadId, tasks);
    } else if (event.type === "task.completed") {
      const tasks = openTasks.get(event.threadId);
      tasks?.delete(event.payload.taskId);
      if (tasks?.size === 0) openTasks.delete(event.threadId);
    } else if (event.type === "session.exited") {
      openTasks.delete(event.threadId);
      lastTouchedAt.delete(event.threadId);
    }
  };

  const observe = (event: ProviderRuntimeEvent): Effect.Effect<void> => {
    trackTask(event);
    switch (event.type) {
      case "turn.completed":
      case "task.started":
      case "task.progress":
      case "task.completed":
        return touch(event.threadId).pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("provider.session.activity.touch-failed", {
              threadId: event.threadId,
              cause,
            }),
          ),
        );
      default:
        return Effect.void;
    }
  };

  const hasOpenTasks = (threadId: ThreadId): boolean => (openTasks.get(threadId)?.size ?? 0) > 0;

  return { observe, hasOpenTasks };
}
