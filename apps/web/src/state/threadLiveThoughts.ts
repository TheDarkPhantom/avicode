/**
 * Avi Code addition: the latest thought line for a running thread, read from
 * the environment's live thought stream. Each row reads its own derived atom,
 * so a stream update re-renders only the rows whose line changed.
 */
import { useAtomValue } from "@effect/atom-react";
import { createEnvironmentRpcSubscriptionAtomFamily } from "@t3tools/client-runtime/state/runtime";
import {
  WS_METHODS,
  type EnvironmentId,
  type ThreadId,
  type ThreadLiveThoughtsSnapshot,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import { AsyncResult, Atom } from "effect/unstable/reactivity";

import { connectionAtomRuntime } from "../connection/runtime";

const liveThoughtsSubscription = createEnvironmentRpcSubscriptionAtomFamily(connectionAtomRuntime, {
  label: "environment-data:thread-live-thoughts",
  tag: WS_METHODS.subscribeThreadLiveThoughts,
});

/** The line for one thread in a stream snapshot, or null when it has none. */
export function selectThreadLiveThought(
  snapshot: ThreadLiveThoughtsSnapshot | null,
  threadId: ThreadId,
): string | null {
  return snapshot?.thoughts.find((thought) => thought.threadId === threadId)?.line ?? null;
}

// Strings compare by value, so a snapshot that leaves this thread's line alone
// does not notify the row.
const threadLiveThoughtAtom = Atom.family((key: string) => {
  const [environmentId, threadId] = JSON.parse(key) as [EnvironmentId, ThreadId];
  return Atom.make((get) =>
    selectThreadLiveThought(
      Option.getOrNull(
        AsyncResult.value(get(liveThoughtsSubscription({ environmentId, input: {} }))),
      ),
      threadId,
    ),
  ).pipe(Atom.withLabel(`thread-live-thought:${key}`));
});

/**
 * Mount only for a running thread: the hook opens the environment's stream,
 * which a server without it fails quietly, leaving the line empty.
 */
export function useThreadLiveThought(environmentId: EnvironmentId, threadId: ThreadId) {
  return useAtomValue(threadLiveThoughtAtom(JSON.stringify([environmentId, threadId])));
}
