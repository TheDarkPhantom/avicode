import { useSyncExternalStore } from "react";

import { shortcutModifierStore, type ShortcutModifierState } from "../../shortcutModifierState";
import { useTerminalUiStateStore } from "../../terminalUiStateStore";
import { THREAD_JUMP_HINT_SHOW_DELAY_MS } from "../Sidebar.logic";

export interface ExternalStore<T> {
  readonly subscribe: (listener: () => void) => () => void;
  readonly getSnapshot: () => T;
}

/**
 * Whether the current modifier combination, including none, has been held
 * unchanged for `delayMs`. Every modifier change restarts the hold.
 */
export function createModifierHoldStore(
  modifiers: Pick<ExternalStore<unknown>, "subscribe">,
  delayMs: number,
): ExternalStore<boolean> {
  const listeners = new Set<() => void>();
  let held = false;
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let stopModifiers: (() => void) | null = null;

  const setHeld = (next: boolean) => {
    if (held === next) return;
    held = next;
    for (const listener of listeners) listener();
  };
  const clearPendingHold = () => {
    if (timeoutId === null) return;
    clearTimeout(timeoutId);
    timeoutId = null;
  };
  const onModifiersChange = () => {
    clearPendingHold();
    setHeld(false);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      setHeld(true);
    }, delayMs);
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      if (stopModifiers === null) {
        stopModifiers = modifiers.subscribe(onModifiersChange);
        onModifiersChange();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopModifiers?.();
        stopModifiers = null;
        clearPendingHold();
        held = false;
      };
    },
    getSnapshot: () => held,
  };
}

const threadJumpModifierHold = createModifierHoldStore(
  shortcutModifierStore,
  THREAD_JUMP_HINT_SHOW_DELAY_MS,
);

function subscribeToThreadJumpHintInputs(listener: () => void): () => void {
  const unsubscribeHold = threadJumpModifierHold.subscribe(listener);
  // Terminal visibility can change which binding the held modifiers match.
  const unsubscribeTerminals = useTerminalUiStateStore.subscribe(listener);
  return () => {
    unsubscribeHold();
    unsubscribeTerminals();
  };
}

/**
 * Thread jump hints appear once the jump modifier has been held for a moment,
 * so a quick shortcut never flashes them, and hide as soon as it is released.
 * The snapshot is the visibility itself, so a modifier press that shows no
 * hints (Ctrl+J opening the terminal, say) never re-renders the sidebar.
 */
export function useThreadJumpHintsVisible(
  shouldShowForModifiers: (modifiers: ShortcutModifierState) => boolean,
): boolean {
  return useSyncExternalStore(
    subscribeToThreadJumpHintInputs,
    () =>
      threadJumpModifierHold.getSnapshot() &&
      shouldShowForModifiers(shortcutModifierStore.getSnapshot()),
  );
}
