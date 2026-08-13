/**
 * Whole-window zoom for the desktop app.
 *
 * Electron ships `zoomIn`/`zoomOut`/`resetZoom` menu roles, but on Windows and
 * Linux a menu accelerator only fires when the page leaves the key unhandled —
 * so any `preventDefault()` upstream (the preview panel, xterm) silently kills
 * it, and the main window is frameless there, meaning there is no visible View
 * menu to fall back to. Owning zoom in the renderer makes the shortcut work
 * from every focus context and makes it reboundable like any other command.
 *
 * The level is Chromium's logarithmic zoom step, matching `webFrame`: each step
 * is a factor of 1.2, and 0 is 100%.
 */

const ZOOM_LEVEL_STORAGE_KEY = "avicode:app-zoom-level";
const APP_ZOOM_CHANGE_EVENT = "avicode:app-zoom-change";

export const APP_ZOOM_MIN_LEVEL = -5;
export const APP_ZOOM_MAX_LEVEL = 5;

export function clampAppZoomLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(APP_ZOOM_MAX_LEVEL, Math.max(APP_ZOOM_MIN_LEVEL, level));
}

/** Matches Chromium's page-zoom scale for a discrete Electron zoom level. */
export function appZoomFactorFromLevel(level: number): number {
  return 1.2 ** clampAppZoomLevel(level);
}

/** Converts renderer CSS pixels into the native window units used by BrowserWindow bounds. */
export function appCssPixelsToWindowUnits(cssPixels: number, level: number): number {
  if (!Number.isFinite(cssPixels)) return 0;
  return Math.max(0, Math.round(cssPixels * appZoomFactorFromLevel(level)));
}

function readStoredZoomLevel(): number {
  try {
    const raw = window.localStorage.getItem(ZOOM_LEVEL_STORAGE_KEY);
    if (raw === null) return 0;
    return clampAppZoomLevel(Number.parseFloat(raw));
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). Zoom is a
    // convenience, so fall back to 100% rather than failing the caller.
    return 0;
  }
}

function writeStoredZoomLevel(level: number): void {
  try {
    window.localStorage.setItem(ZOOM_LEVEL_STORAGE_KEY, String(level));
  } catch {
    // Ignore quota/storage errors; the zoom itself has already been applied.
  }
}

function bridge() {
  return typeof window === "undefined" ? undefined : window.desktopBridge;
}

/** True when whole-window zoom is available (desktop app only). */
export function isAppZoomSupported(): boolean {
  return typeof bridge()?.setAppZoomLevel === "function";
}

export function getAppZoomLevel(): number {
  const desktop = bridge();
  if (typeof desktop?.getAppZoomLevel !== "function") return 0;
  return clampAppZoomLevel(desktop.getAppZoomLevel());
}

/** Applies and persists an absolute level. Returns the level actually applied. */
export function setAppZoomLevel(level: number): number {
  const desktop = bridge();
  if (typeof desktop?.setAppZoomLevel !== "function") return 0;
  const applied = clampAppZoomLevel(desktop.setAppZoomLevel(clampAppZoomLevel(level)));
  writeStoredZoomLevel(applied);
  window.dispatchEvent(new Event(APP_ZOOM_CHANGE_EVENT));
  return applied;
}

export function subscribeToAppZoomLevel(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(APP_ZOOM_CHANGE_EVENT, onChange);
  return () => window.removeEventListener(APP_ZOOM_CHANGE_EVENT, onChange);
}

export function adjustAppZoomLevel(delta: number): number {
  return setAppZoomLevel(getAppZoomLevel() + delta);
}

export function resetAppZoomLevel(): number {
  return setAppZoomLevel(0);
}

/**
 * Re-applies the persisted level. Call once during startup — Electron resets
 * the frame to 100% on every load, so without this the setting only survives
 * until the window reloads.
 */
export function restorePersistedAppZoomLevel(): void {
  if (!isAppZoomSupported()) return;
  const stored = readStoredZoomLevel();
  if (stored === 0) return;
  setAppZoomLevel(stored);
}
