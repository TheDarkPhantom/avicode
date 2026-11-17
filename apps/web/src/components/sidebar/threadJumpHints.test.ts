import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import { THREAD_JUMP_HINT_SHOW_DELAY_MS } from "../Sidebar.logic";
import { createModifierHoldStore } from "./threadJumpHints";

function fakeModifierStore() {
  const listeners = new Set<() => void>();
  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    change: () => {
      for (const listener of listeners) listener();
    },
    listenerCount: () => listeners.size,
  };
}

describe("createModifierHoldStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reports a hold only once the modifiers stay unchanged for the delay", () => {
    const modifiers = fakeModifierStore();
    const hold = createModifierHoldStore(modifiers, THREAD_JUMP_HINT_SHOW_DELAY_MS);
    const notifications: boolean[] = [];
    const unsubscribe = hold.subscribe(() => notifications.push(hold.getSnapshot()));

    modifiers.change();
    vi.advanceTimersByTime(THREAD_JUMP_HINT_SHOW_DELAY_MS - 1);
    expect(hold.getSnapshot()).toBe(false);
    expect(notifications).toEqual([]);

    vi.advanceTimersByTime(1);
    expect(notifications).toEqual([true]);

    // Releasing ends the hold at once.
    modifiers.change();
    expect(notifications).toEqual([true, false]);
    unsubscribe();
  });

  it("never notifies for a modifier change shorter than the delay", () => {
    const modifiers = fakeModifierStore();
    const hold = createModifierHoldStore(modifiers, THREAD_JUMP_HINT_SHOW_DELAY_MS);
    const notifications: boolean[] = [];
    const unsubscribe = hold.subscribe(() => notifications.push(hold.getSnapshot()));

    modifiers.change();
    vi.advanceTimersByTime(Math.floor(THREAD_JUMP_HINT_SHOW_DELAY_MS / 2));
    modifiers.change();
    vi.advanceTimersByTime(Math.floor(THREAD_JUMP_HINT_SHOW_DELAY_MS / 2));
    expect(notifications).toEqual([]);
    unsubscribe();
  });

  it("stops tracking modifiers once the last subscriber leaves", () => {
    const modifiers = fakeModifierStore();
    const hold = createModifierHoldStore(modifiers, THREAD_JUMP_HINT_SHOW_DELAY_MS);
    const unsubscribe = hold.subscribe(() => {});
    vi.advanceTimersByTime(THREAD_JUMP_HINT_SHOW_DELAY_MS);
    expect(hold.getSnapshot()).toBe(true);

    unsubscribe();
    expect(modifiers.listenerCount()).toBe(0);
    expect(hold.getSnapshot()).toBe(false);
  });
});
