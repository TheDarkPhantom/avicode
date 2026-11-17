import { useSyncExternalStore } from "react";

export interface ShortcutModifierState {
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

const EMPTY_SHORTCUT_MODIFIER_STATE: ShortcutModifierState = {
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
};

export function areShortcutModifierStatesEqual(
  left: ShortcutModifierState,
  right: ShortcutModifierState,
): boolean {
  return (
    left.metaKey === right.metaKey &&
    left.ctrlKey === right.ctrlKey &&
    left.altKey === right.altKey &&
    left.shiftKey === right.shiftKey
  );
}

function createShortcutModifierStore() {
  let state = EMPTY_SHORTCUT_MODIFIER_STATE;
  const listeners = new Set<() => void>();
  let stopTracking: (() => void) | null = null;

  const updateState = (next: ShortcutModifierState) => {
    // Ordinary typing returns here, before any subscriber hears about it.
    if (areShortcutModifierStatesEqual(state, next)) return;
    state = next;
    for (const listener of listeners) listener();
  };
  const onKeyboardEvent = (event: KeyboardEvent) => {
    updateState(shortcutModifierStateAfterKeyboardEvent(state, event));
  };
  const onWindowBlur = () => {
    updateState(EMPTY_SHORTCUT_MODIFIER_STATE);
  };
  const startTracking = () => {
    window.addEventListener("keydown", onKeyboardEvent, true);
    window.addEventListener("keyup", onKeyboardEvent, true);
    window.addEventListener("blur", onWindowBlur);
    return () => {
      window.removeEventListener("keydown", onKeyboardEvent, true);
      window.removeEventListener("keyup", onKeyboardEvent, true);
      window.removeEventListener("blur", onWindowBlur);
      state = EMPTY_SHORTCUT_MODIFIER_STATE;
    };
  };

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      stopTracking ??= startTracking();
      return () => {
        listeners.delete(listener);
        if (listeners.size > 0) return;
        stopTracking?.();
        stopTracking = null;
      };
    },
    getSnapshot: () => state,
  };
}

/** Shared by every subscriber; read it from a snapshot to re-render only when a derived value changes. */
export const shortcutModifierStore = createShortcutModifierStore();

export function useShortcutModifierState(): ShortcutModifierState {
  return useSyncExternalStore(shortcutModifierStore.subscribe, shortcutModifierStore.getSnapshot);
}

function normalizeModifierKey(key: string): keyof ShortcutModifierState | null {
  switch (key) {
    case "Meta":
    case "OS":
    case "Command":
      return "metaKey";
    case "Control":
      return "ctrlKey";
    case "Alt":
    case "Option":
      return "altKey";
    case "Shift":
      return "shiftKey";
    default:
      return null;
  }
}

export function shortcutModifierStateAfterKeyboardEvent(
  currentState: ShortcutModifierState,
  event: KeyboardEvent,
): ShortcutModifierState {
  const normalizedModifierKey = normalizeModifierKey(event.key);
  let nextState: ShortcutModifierState;
  if (normalizedModifierKey) {
    nextState = {
      ...currentState,
      [normalizedModifierKey]: event.type === "keydown",
    };
  } else {
    nextState = {
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
    };
  }

  return areShortcutModifierStatesEqual(currentState, nextState) ? currentState : nextState;
}
