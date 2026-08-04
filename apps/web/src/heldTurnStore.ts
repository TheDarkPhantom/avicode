import type { CommandId } from "@t3tools/contracts";
import { create } from "zustand";

import type { ComposerThreadDraftState } from "./composerDraftStore";
import type { QueuedTurnOutboxItem } from "./offlineTurnOutboxStore";

/**
 * Avi Code addition: a turn captured the moment its send was held, waiting for
 * the running turn to finish.
 *
 * The hold used to record only a thread key and re-read the composer when the
 * turn settled, so everything typed in between was swept into the send. A
 * sentence half-written when the turn ended went out half-written, and its
 * remainder became the next message. Building the commands up front and never
 * consulting the composer again is what stops that.
 *
 * Deliberately in-memory, unlike the offline outbox: this is a short wait with
 * the app in front of you, and the composer banner says out loud that a reload
 * loses the hold. Persisting it would buy a schema whose only reader is a few
 * seconds away.
 */
export type HeldTurnItem = QueuedTurnOutboxItem & {
  /** Scoped thread key the hold belongs to. Only that thread flushes it. */
  readonly threadKey: string;
  /**
   * The composer as it stood when the send was held, so cancelling hands the
   * whole draft back rather than only its text. Image preview URLs are already
   * re-created from the retained files, because clearing the composer revokes
   * the originals.
   */
  readonly draft: ComposerThreadDraftState;
};

interface HeldTurnState {
  readonly items: ReadonlyArray<HeldTurnItem>;
  readonly failuresById: Readonly<Record<string, string>>;
  enqueue: (
    item: HeldTurnItem,
  ) => { readonly queued: true } | { readonly queued: false; readonly reason: "already-queued" };
  remove: (itemId: CommandId) => void;
  setFailure: (itemId: CommandId, message: string | null) => void;
}

export const useHeldTurnStore = create<HeldTurnState>()((set, get) => ({
  items: [],
  failuresById: {},
  enqueue: (item) => {
    // One hold per thread, matching the offline outbox. A second send while one
    // is already held is a mistake worth reporting rather than a silent queue.
    if (get().items.some((candidate) => candidate.threadKey === item.threadKey)) {
      return { queued: false, reason: "already-queued" };
    }
    set((state) => ({ items: [...state.items, item] }));
    return { queued: true };
  },
  remove: (itemId) => {
    set((state) => {
      const items = state.items.filter((item) => item.id !== itemId);
      if (items.length === state.items.length) return state;
      const failuresById = { ...state.failuresById };
      delete failuresById[itemId];
      return { items, failuresById };
    });
  },
  setFailure: (itemId, message) => {
    set((state) => {
      const failuresById = { ...state.failuresById };
      if (message === null) delete failuresById[itemId];
      else failuresById[itemId] = message;
      return { failuresById };
    });
  },
}));

export function findHeldTurnForThread(
  items: ReadonlyArray<HeldTurnItem>,
  threadKey: string | null,
): HeldTurnItem | null {
  if (threadKey === null) return null;
  return items.find((item) => item.threadKey === threadKey) ?? null;
}

export function resetHeldTurnStoreForTest(): void {
  useHeldTurnStore.setState({ items: [], failuresById: {} });
}
