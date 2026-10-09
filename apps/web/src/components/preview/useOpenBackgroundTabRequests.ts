import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { useEffect } from "react";

import type { OpenPreviewMutation } from "~/browser/openFileInPreview";
import { parsePreviewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import { useRightPanelStore } from "~/rightPanelStore";

import { openPreviewSession } from "./openPreviewSession";

/**
 * Avi Code addition: resolves which thread should receive a new background tab
 * requested by a guest page. The source runtime tab id encodes its thread; we
 * only act when it belongs to the active environment (whose `openPreview`
 * mutation we hold), which is always the case for the preview the user just
 * middle-clicked.
 */
export function resolveBackgroundTabTarget(
  sourceTabId: string,
  activeEnvironmentId: EnvironmentId,
): ScopedThreadRef | null {
  const parsed = parsePreviewRuntimeTabId(sourceTabId);
  if (!parsed || parsed.threadRef.environmentId !== activeEnvironmentId) return null;
  return parsed.threadRef;
}

/**
 * Avi Code addition: opens a new browser tab when a guest page asks for one. A
 * middle-click or Ctrl/Cmd-click opens it in the background; a
 * `target="_blank"` link opens it focused, so the page that held the link
 * stays put. Works from either pane of a split, because the request is
 * per-webview.
 */
export function useOpenBackgroundTabRequests<E>(input: {
  readonly openPreview: OpenPreviewMutation<E>;
  readonly activeThreadRef: ScopedThreadRef | null;
}): void {
  const { openPreview, activeThreadRef } = input;
  useEffect(() => {
    const preview = window.desktopBridge?.preview;
    if (!preview || !activeThreadRef) return;
    return preview.onOpenTabRequest((request) => {
      const target = resolveBackgroundTabTarget(request.sourceTabId, activeThreadRef.environmentId);
      if (!target) return;
      void (async () => {
        const result = await openPreviewSession({
          openPreview,
          threadRef: target,
          url: request.url,
        });
        if (result._tag !== "Success") return;
        if (request.background) {
          useRightPanelStore.getState().openBrowserBackground(target, result.value.tabId);
        } else {
          useRightPanelStore.getState().openBrowser(target, result.value.tabId);
        }
      })();
    });
  }, [openPreview, activeThreadRef]);
}
