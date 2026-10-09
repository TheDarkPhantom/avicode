/**
 * ThreadLiveThoughts - Avi Code addition. The latest thought of each running
 * thread as one short line, for the sidebar. Held in memory only.
 *
 * @module ThreadLiveThoughts
 */
import type { ThreadLiveThoughtsSnapshot } from "@t3tools/contracts";
import * as Context from "effect/Context";
import type * as Stream from "effect/Stream";

export interface ThreadLiveThoughtsShape {
  /**
   * The current set, then each throttled change. Every item is the full set,
   * so a subscriber only ever needs the latest one.
   */
  readonly changes: Stream.Stream<ThreadLiveThoughtsSnapshot>;
}

export class ThreadLiveThoughts extends Context.Service<
  ThreadLiveThoughts,
  ThreadLiveThoughtsShape
>()("t3/orchestration/Services/ThreadLiveThoughts") {}
