import type { OrchestrationEvent } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { LiveThoughtPublishThrottle, ThreadLiveThoughtTracker } from "./threadLiveThoughts.ts";

const AT = "2026-10-09T00:00:00.000Z";

// The tracker reads only `type` and `payload`, so the event base is left out.
const event = (type: OrchestrationEvent["type"], payload: object) =>
  ({ type, payload }) as unknown as OrchestrationEvent;

const sessionSet = (threadId: string, status: string) =>
  event("thread.session-set", {
    threadId,
    session: { threadId, status, activeTurnId: null, lastError: null, updatedAt: AT },
  });

const messageSent = (
  threadId: string,
  messageId: string,
  role: "user" | "assistant" | "reasoning",
  text: string,
  streaming = true,
) =>
  event("thread.message-sent", {
    threadId,
    messageId,
    role,
    text,
    turnId: "turn-1",
    streaming,
    createdAt: AT,
    updatedAt: AT,
  });

function runningTracker(threadId = "thread-1") {
  const tracker = new ThreadLiveThoughtTracker();
  tracker.apply(sessionSet(threadId, "running"));
  return tracker;
}

describe("ThreadLiveThoughtTracker", () => {
  it("reports a change only when the derived line changes", () => {
    const tracker = runningTracker();
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", "Found"))).toBe(true);
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", " the cause."))).toBe(true);
    // Past the first sentence, more tokens leave the line alone.
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", " Now checking"))).toBe(false);
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", " the UI."))).toBe(false);
    expect(tracker.snapshot()).toEqual([{ threadId: "thread-1", line: "Found the cause." }]);
  });

  it("keeps the previous line until the next thought has text", () => {
    const tracker = runningTracker();
    tracker.apply(messageSent("thread-1", "r1", "reasoning", "First idea."));
    expect(tracker.apply(messageSent("thread-1", "r2", "reasoning", "  "))).toBe(false);
    expect(tracker.snapshot()).toEqual([{ threadId: "thread-1", line: "First idea." }]);
    expect(tracker.apply(messageSent("thread-1", "r2", "reasoning", "**Second idea**\n"))).toBe(
      true,
    );
    expect(tracker.snapshot()).toEqual([{ threadId: "thread-1", line: "Second idea" }]);
  });

  it("replaces the text on a non-empty completion and ignores an empty one", () => {
    const tracker = runningTracker();
    tracker.apply(messageSent("thread-1", "r1", "reasoning", "Draft"));
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", "", false))).toBe(false);
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", "Final words.", false))).toBe(
      true,
    );
    expect(tracker.snapshot()).toEqual([{ threadId: "thread-1", line: "Final words." }]);
  });

  it("ignores assistant text and threads that are not running", () => {
    const tracker = runningTracker();
    expect(tracker.apply(messageSent("thread-1", "a1", "assistant", "Answer."))).toBe(false);
    expect(tracker.apply(messageSent("thread-2", "r1", "reasoning", "Stray thought."))).toBe(false);
    expect(tracker.snapshot()).toEqual([]);
  });

  it("drops the line when the turn ends, a prompt arrives, or the thread goes away", () => {
    const ends = [
      sessionSet("thread-1", "ready"),
      messageSent("thread-1", "u1", "user", "Steer"),
      event("thread.turn-start-requested", { threadId: "thread-1" }),
      event("thread.archived", { threadId: "thread-1" }),
      event("thread.deleted", { threadId: "thread-1" }),
    ];
    for (const end of ends) {
      const tracker = runningTracker();
      tracker.apply(messageSent("thread-1", "r1", "reasoning", "Thinking hard."));
      expect(tracker.apply(end)).toBe(true);
      expect(tracker.snapshot()).toEqual([]);
    }
  });

  it("stops listening to a thread once its session leaves running", () => {
    const tracker = runningTracker();
    tracker.apply(sessionSet("thread-1", "ready"));
    expect(tracker.apply(messageSent("thread-1", "r1", "reasoning", "Late thought."))).toBe(false);
    expect(tracker.snapshot()).toEqual([]);
  });

  it("caps a long line for the wire", () => {
    const tracker = runningTracker();
    tracker.apply(messageSent("thread-1", "r1", "reasoning", "word ".repeat(200)));
    const [thought] = tracker.snapshot();
    expect(thought?.line.length).toBeLessThanOrEqual(140);
  });
});

describe("LiveThoughtPublishThrottle", () => {
  it("publishes the first change at once and coalesces the rest into one trailing publish", () => {
    const throttle = new LiveThoughtPublishThrottle(1_000);
    expect(throttle.onChange(0)).toEqual({ kind: "publish" });
    throttle.onPublished(0);
    expect(throttle.onChange(200)).toEqual({ kind: "schedule", delayMs: 800 });
    expect(throttle.onChange(500)).toEqual({ kind: "wait" });
    throttle.onPublished(1_000);
    expect(throttle.onChange(1_100)).toEqual({ kind: "schedule", delayMs: 900 });
    throttle.onPublished(2_000);
    expect(throttle.onChange(3_500)).toEqual({ kind: "publish" });
  });
});
