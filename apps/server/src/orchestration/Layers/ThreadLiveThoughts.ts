import type { ThreadLiveThoughtsSnapshot } from "@t3tools/contracts";
import * as Clock from "effect/Clock";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";
import * as SubscriptionRef from "effect/SubscriptionRef";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import {
  ThreadLiveThoughts,
  type ThreadLiveThoughtsShape,
} from "../Services/ThreadLiveThoughts.ts";
import { LiveThoughtPublishThrottle, ThreadLiveThoughtTracker } from "../threadLiveThoughts.ts";

/** At most one sidebar update per second, across all threads. */
export const LIVE_THOUGHT_PUBLISH_INTERVAL_MS = 1_000;

const make = Effect.gen(function* () {
  const orchestrationEngine = yield* OrchestrationEngineService;
  const scope = yield* Effect.scope;
  const tracker = new ThreadLiveThoughtTracker();
  const throttle = new LiveThoughtPublishThrottle(LIVE_THOUGHT_PUBLISH_INTERVAL_MS);
  const current = yield* SubscriptionRef.make<ThreadLiveThoughtsSnapshot>({ thoughts: [] });

  const publish = Effect.gen(function* () {
    throttle.onPublished(yield* Clock.currentTimeMillis);
    yield* SubscriptionRef.set(current, { thoughts: tracker.snapshot() });
  });

  const onChange = Effect.gen(function* () {
    const decision = throttle.onChange(yield* Clock.currentTimeMillis);
    if (decision.kind === "publish") {
      yield* publish;
    } else if (decision.kind === "schedule") {
      yield* Effect.forkIn(Effect.sleep(decision.delayMs).pipe(Effect.andThen(publish)), scope);
    }
  });

  yield* Effect.forkScoped(
    Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) =>
      tracker.apply(event) ? onChange : Effect.void,
    ),
    { startImmediately: true },
  );

  return {
    changes: SubscriptionRef.changes(current),
  } satisfies ThreadLiveThoughtsShape;
});

export const ThreadLiveThoughtsLive = Layer.effect(ThreadLiveThoughts, make);
