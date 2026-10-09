import type { OrchestrationEvent, ThreadLiveThoughtsSnapshot } from "@t3tools/contracts";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Queue from "effect/Queue";
import * as Stream from "effect/Stream";
import * as TestClock from "effect/testing/TestClock";

import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ThreadLiveThoughts } from "../Services/ThreadLiveThoughts.ts";
import { LIVE_THOUGHT_PUBLISH_INTERVAL_MS, ThreadLiveThoughtsLive } from "./ThreadLiveThoughts.ts";

const AT = "2026-10-09T00:00:00.000Z";

// The layer reads only `type` and `payload`, so the event base is left out.
const event = (type: OrchestrationEvent["type"], payload: object) =>
  ({ type, payload }) as unknown as OrchestrationEvent;

const running = event("thread.session-set", {
  threadId: "thread-1",
  session: { threadId: "thread-1", status: "running", activeTurnId: null, lastError: null },
});

const thought = (messageId: string, text: string) =>
  event("thread.message-sent", {
    threadId: "thread-1",
    messageId,
    role: "reasoning",
    text,
    turnId: "turn-1",
    streaming: true,
    createdAt: AT,
    updatedAt: AT,
  });

const lines = (snapshot: ThreadLiveThoughtsSnapshot) => snapshot.thoughts.map((t) => t.line);

it.effect("throttles live thought updates to one per interval", () =>
  Effect.gen(function* () {
    const events = yield* Queue.unbounded<OrchestrationEvent>();
    const received = yield* Queue.unbounded<ThreadLiveThoughtsSnapshot>();
    const layer = ThreadLiveThoughtsLive.pipe(
      Layer.provide(
        Layer.mock(OrchestrationEngineService)({ streamDomainEvents: Stream.fromQueue(events) }),
      ),
    );

    yield* Effect.gen(function* () {
      const { changes } = yield* ThreadLiveThoughts;
      const fiber = yield* changes.pipe(
        Stream.runForEach((snapshot) => Queue.offer(received, snapshot)),
        Effect.forkChild,
      );

      expect(lines(yield* Queue.take(received))).toEqual([]);

      yield* Queue.offerAll(events, [running, thought("r1", "First idea.")]);
      // The first change after a quiet interval goes out at once.
      expect(lines(yield* Queue.take(received))).toEqual(["First idea."]);

      // Two more changes inside the interval coalesce into one trailing publish.
      yield* Queue.offerAll(events, [thought("r2", "Second idea."), thought("r3", "Third idea.")]);
      yield* TestClock.adjust(LIVE_THOUGHT_PUBLISH_INTERVAL_MS - 1);
      expect(yield* Queue.size(received)).toBe(0);
      yield* TestClock.adjust(1);
      expect(lines(yield* Queue.take(received))).toEqual(["Third idea."]);
      expect(yield* Queue.size(received)).toBe(0);

      yield* Fiber.interrupt(fiber);
    }).pipe(Effect.provide(layer));
  }),
);
