import { assert, describe, it } from "@effect/vitest";
import {
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
  type ProviderRuntimeEvent,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as TestClock from "effect/testing/TestClock";

import type {
  ProviderRuntimeBinding,
  ProviderSessionDirectoryShape,
} from "../Services/ProviderSessionDirectory.ts";
import { makeProviderSessionActivity } from "./providerSessionActivity.ts";

const threadId = ThreadId.make("thread-activity");
const provider = ProviderDriverKind.make("claudeAgent");
const providerInstanceId = ProviderInstanceId.make("claudeAgent");

function makeFakeDirectory(binding: ProviderRuntimeBinding | undefined) {
  const upserts: Array<ProviderRuntimeBinding> = [];
  const directory: ProviderSessionDirectoryShape = {
    upsert: (next) => Effect.sync(() => void upserts.push(next)),
    getProvider: () => Effect.die("unused"),
    getBinding: () => Effect.succeed(Option.fromNullishOr(binding)),
    listThreadIds: () => Effect.die("unused"),
    listBindings: () => Effect.die("unused"),
  };
  return { directory, upserts };
}

const event = (type: string, payload: Record<string, unknown> = {}) =>
  ({
    type,
    eventId: `event-${type}`,
    provider,
    createdAt: "2026-11-24T00:00:00.000Z",
    threadId,
    payload,
  }) as unknown as ProviderRuntimeEvent;

const liveBinding: ProviderRuntimeBinding = {
  threadId,
  provider,
  providerInstanceId,
  status: "running",
};

describe("providerSessionActivity", () => {
  it.effect("tracks open tasks from start to completion", () =>
    Effect.gen(function* () {
      const { directory } = makeFakeDirectory(liveBinding);
      const activity = makeProviderSessionActivity({ directory });

      yield* activity.observe(event("task.started", { taskId: "task-1" }));
      yield* activity.observe(event("task.started", { taskId: "task-2" }));
      assert.isTrue(activity.hasOpenTasks(threadId));

      yield* activity.observe(event("task.completed", { taskId: "task-1" }));
      assert.isTrue(activity.hasOpenTasks(threadId));

      yield* activity.observe(event("task.completed", { taskId: "task-2" }));
      assert.isFalse(activity.hasOpenTasks(threadId));
    }),
  );

  it.effect("forgets open tasks when the session exits", () =>
    Effect.gen(function* () {
      const { directory } = makeFakeDirectory(liveBinding);
      const activity = makeProviderSessionActivity({ directory });

      yield* activity.observe(event("task.started", { taskId: "task-1" }));
      yield* activity.observe(event("session.exited"));
      assert.isFalse(activity.hasOpenTasks(threadId));
    }),
  );

  it.effect("refreshes the binding when a turn completes, throttled per thread", () =>
    Effect.gen(function* () {
      const { directory, upserts } = makeFakeDirectory(liveBinding);
      const activity = makeProviderSessionActivity({ directory, touchThrottleMs: 60_000 });

      yield* activity.observe(event("turn.completed"));
      assert.deepEqual(upserts, [{ threadId, provider, providerInstanceId }]);

      yield* activity.observe(event("task.progress", { taskId: "task-1" }));
      assert.equal(upserts.length, 1);

      yield* TestClock.adjust("61 seconds");
      yield* activity.observe(event("task.progress", { taskId: "task-1" }));
      assert.equal(upserts.length, 2);
    }),
  );

  it.effect("ignores activity on stopped or unknown sessions", () =>
    Effect.gen(function* () {
      const stopped = makeFakeDirectory({ ...liveBinding, status: "stopped" });
      yield* makeProviderSessionActivity({ directory: stopped.directory }).observe(
        event("turn.completed"),
      );
      assert.equal(stopped.upserts.length, 0);

      const missing = makeFakeDirectory(undefined);
      yield* makeProviderSessionActivity({ directory: missing.directory }).observe(
        event("turn.completed"),
      );
      assert.equal(missing.upserts.length, 0);
    }),
  );

  it.effect("does not touch the binding for unrelated events", () =>
    Effect.gen(function* () {
      const { directory, upserts } = makeFakeDirectory(liveBinding);
      yield* makeProviderSessionActivity({ directory }).observe(event("content.delta"));
      assert.equal(upserts.length, 0);
    }),
  );
});
