/**
 * Returns true when the user's keyboard focus is somewhere inside the
 * preview panel (URL bar, chrome buttons, or — once detected via Electron
 * `<webview>` focus events — the embedded page).
 *
 * Used by the global keybinding handler to gate `preview.refresh` and
 * `preview.focusUrl` to only fire while the preview owns focus.
 */
export function isPreviewFocused(): boolean {
  const activeElement = document.activeElement;
  if (!(activeElement instanceof HTMLElement)) return false;
  if (!activeElement.isConnected) return false;
  // Every `<webview>` in the app is a preview session surface: they are all
  // rendered by `ElectronBrowserHost` from `useActivePreviewSessions`, hoisted
  // to the app root rather than nested in the panel. So the tag check is the
  // right test for "the embedded page owns focus"; whether the panel is
  // actually open is gated separately by the `previewOpen` shortcut context.
  if (activeElement.tagName.toLowerCase() === "webview") return true;
  return activeElement.closest("[data-preview-panel-mode]") !== null;
}
