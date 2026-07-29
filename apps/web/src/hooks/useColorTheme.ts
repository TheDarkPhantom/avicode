import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  applyColorThemeAttribute,
  clearColorThemeStorageFailure,
  COLOR_THEME_STORAGE_KEY,
  type ColorThemeId,
  DEFAULT_COLOR_THEME,
  getStoredColorTheme,
  isColorThemeStorageError,
  ColorThemeStorageError,
  writeColorThemePreference,
} from "~/lib/colorTheme";
import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";

import { syncBrowserChromeTheme } from "./useTheme";

/**
 * Avi Code addition. Sibling of `useTheme` (light/dark/system): this picks the
 * palette, that picks the mode. Same store shape and same localStorage-backed
 * strategy — see `lib/colorTheme.ts` for why this is not a client setting.
 */

let listeners: Array<() => void> = [];
let lastAppliedColorTheme: ColorThemeId | null = null;

function emitChange() {
  for (const listener of listeners) listener();
}

function applyColorTheme(colorTheme: ColorThemeId, suppressTransitions = false) {
  if (typeof document === "undefined") return;
  if (lastAppliedColorTheme === colorTheme) return;

  if (suppressTransitions) {
    document.documentElement.classList.add("no-transitions");
  }
  applyColorThemeAttribute(colorTheme);
  lastAppliedColorTheme = colorTheme;
  // The browser chrome / <meta name="theme-color"> is derived from computed
  // styles, so it picks up the new palette for free once the attribute lands.
  syncBrowserChromeTheme();
  if (suppressTransitions) {
    // Force a reflow so the no-transitions class takes effect before removal.
    // oxlint-disable-next-line no-unused-expressions
    document.documentElement.offsetHeight;
    requestAnimationFrame(() => {
      document.documentElement.classList.remove("no-transitions");
    });
  }
}

// Apply immediately on module load to prevent a flash. index.html's pre-paint
// script has normally already done this; this covers the case where it failed
// or the bundle was loaded without it.
if (typeof document !== "undefined" && typeof window !== "undefined") {
  applyColorTheme(getStoredColorTheme());
}

function getSnapshot(): ColorThemeId {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  return getStoredColorTheme();
}

function getServerSnapshot(): ColorThemeId {
  return DEFAULT_COLOR_THEME;
}

function subscribe(listener: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  listeners.push(listener);

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== COLOR_THEME_STORAGE_KEY) return;
    clearColorThemeStorageFailure();
    applyColorTheme(getStoredColorTheme(), true);
    emitChange();
  };
  window.addEventListener("storage", handleStorage);

  return () => {
    listeners = listeners.filter((entry) => entry !== listener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function useColorTheme() {
  const colorTheme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setColorTheme = useCallback((next: ColorThemeId) => {
    if (typeof window === "undefined") return;
    try {
      writeColorThemePreference(next);
      clearColorThemeStorageFailure();
    } catch (cause) {
      const error = isColorThemeStorageError(cause)
        ? cause
        : new ColorThemeStorageError({
            operation: "write",
            storageKey: COLOR_THEME_STORAGE_KEY,
            colorTheme: next,
            cause,
          });
      console.error(error.message, {
        operation: error.operation,
        storageKey: error.storageKey,
        colorTheme: next,
        ...safeErrorLogAttributes(error),
      });
      return;
    }
    applyColorTheme(next, true);
    emitChange();
  }, []);

  // Keep the DOM in sync on mount and across re-entry (e.g. after another tab
  // wrote the key while this one was backgrounded).
  useEffect(() => {
    applyColorTheme(colorTheme);
  }, [colorTheme]);

  return { colorTheme, setColorTheme } as const;
}
