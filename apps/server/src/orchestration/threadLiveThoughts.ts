/**
 * Avi Code addition: pure state for the sidebar's live thought lines. The
 * tracker folds domain events into one short line per running thread; the
 * throttle decides when the current set may go out on the wire.
 */
import type {
  MessageId,
  OrchestrationEvent,
  ThreadId,
  ThreadLiveThought,
} from "@t3tools/contracts";
import { sidebarLiveThoughtLine } from "@t3tools/shared/liveThoughtLine";

/**
 * Enough text to find the first sentence or heading. A thought longer than
 * this keeps the line it already has, so a long trace costs nothing more.
 */
const MAX_TRACKED_TEXT_LENGTH = 2_000;

interface ThreadThoughtState {
  messageId: MessageId;
  text: string;
  /** Latest non-empty line. A new thought that has no text yet keeps it. */
  line: string;
}

export class ThreadLiveThoughtTracker {
  private readonly runningThreadIds = new Set<ThreadId>();
  private readonly stateByThreadId = new Map<ThreadId, ThreadThoughtState>();

  /** Folds one domain event. True when a visible line changed. */
  apply(event: OrchestrationEvent): boolean {
    switch (event.type) {
      case "thread.session-set": {
        const { threadId, session } = event.payload;
        if (session.status === "running" || session.status === "starting") {
          this.runningThreadIds.add(threadId);
          return false;
        }
        this.runningThreadIds.delete(threadId);
        return this.clear(threadId);
      }
      case "thread.deleted":
      case "thread.archived":
        this.runningThreadIds.delete(event.payload.threadId);
        return this.clear(event.payload.threadId);
      case "thread.turn-start-requested":
        return this.clear(event.payload.threadId);
      case "thread.message-sent": {
        const { payload } = event;
        // A new prompt or a steer starts over from the next thought.
        if (payload.role === "user") return this.clear(payload.threadId);
        if (payload.role !== "reasoning" || !this.runningThreadIds.has(payload.threadId)) {
          return false;
        }
        return this.applyReasoning(payload.threadId, payload.messageId, payload.text, {
          streaming: payload.streaming,
        });
      }
      default:
        return false;
    }
  }

  /** Every running thread that has a line, in no particular order. */
  snapshot(): ThreadLiveThought[] {
    const thoughts: ThreadLiveThought[] = [];
    for (const [threadId, state] of this.stateByThreadId) {
      if (state.line !== "") thoughts.push({ threadId, line: state.line });
    }
    return thoughts;
  }

  private applyReasoning(
    threadId: ThreadId,
    messageId: MessageId,
    text: string,
    options: { streaming: boolean },
  ): boolean {
    const existing = this.stateByThreadId.get(threadId);
    if (existing === undefined || existing.messageId !== messageId) {
      const state = { messageId, text: "", line: existing?.line ?? "" };
      this.stateByThreadId.set(threadId, state);
      return this.updateText(state, text);
    }
    if (existing.text.length >= MAX_TRACKED_TEXT_LENGTH) return false;
    // Same fold as the projector: deltas append, a non-empty completion replaces.
    if (options.streaming) return this.updateText(existing, existing.text + text);
    return text.length > 0 ? this.updateText(existing, text) : false;
  }

  private updateText(state: ThreadThoughtState, text: string): boolean {
    state.text = text.slice(0, MAX_TRACKED_TEXT_LENGTH);
    const line = sidebarLiveThoughtLine(state.text);
    if (line === "" || line === state.line) return false;
    state.line = line;
    return true;
  }

  private clear(threadId: ThreadId): boolean {
    const state = this.stateByThreadId.get(threadId);
    this.stateByThreadId.delete(threadId);
    return state !== undefined && state.line !== "";
  }
}

export type LiveThoughtPublishDecision =
  | { readonly kind: "publish" }
  | { readonly kind: "schedule"; readonly delayMs: number }
  | { readonly kind: "wait" };

/**
 * At most one publish per interval: the first change after a quiet interval
 * goes out at once, and later ones coalesce into a single trailing publish.
 */
export class LiveThoughtPublishThrottle {
  private readonly intervalMs: number;
  private lastPublishedAtMs = Number.NEGATIVE_INFINITY;
  private trailingScheduled = false;

  constructor(intervalMs: number) {
    this.intervalMs = intervalMs;
  }

  onChange(nowMs: number): LiveThoughtPublishDecision {
    if (this.trailingScheduled) return { kind: "wait" };
    const sinceLastMs = nowMs - this.lastPublishedAtMs;
    if (sinceLastMs >= this.intervalMs) return { kind: "publish" };
    this.trailingScheduled = true;
    return { kind: "schedule", delayMs: this.intervalMs - sinceLastMs };
  }

  onPublished(nowMs: number): void {
    this.lastPublishedAtMs = nowMs;
    this.trailingScheduled = false;
  }
}
