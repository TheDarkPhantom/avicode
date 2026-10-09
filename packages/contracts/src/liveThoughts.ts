/**
 * Avi Code addition: the agent's latest thought for each running thread, as
 * one short line, for the sidebar. Ephemeral: never persisted, and a thread
 * drops out of the list when its turn ends.
 */
import * as Schema from "effect/Schema";

import { ThreadId } from "./baseSchemas.ts";

export const ThreadLiveThought = Schema.Struct({
  threadId: ThreadId,
  /** First sentence or heading of the thought, at most 140 characters. */
  line: Schema.String,
});
export type ThreadLiveThought = typeof ThreadLiveThought.Type;

/** The full current set. Each stream item replaces the previous one. */
export const ThreadLiveThoughtsSnapshot = Schema.Struct({
  thoughts: Schema.Array(ThreadLiveThought),
});
export type ThreadLiveThoughtsSnapshot = typeof ThreadLiveThoughtsSnapshot.Type;
