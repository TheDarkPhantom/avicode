import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, PreviewAutomationHostFocus } from "@t3tools/contracts";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import type { ThreadPreviewState } from "~/previewStateStore";

export type PreviewAutomationLiveTab = NonNullable<PreviewAutomationHostFocus["liveTabs"]>[number];

/**
 * Tabs this desktop runtime can actually drive for one environment: a tab
 * counts only once its web contents exist locally, so a server snapshot alone
 * never claims ownership. `visible` marks tabs currently presented on screen.
 */
export function collectPreviewAutomationLiveTabs(input: {
  readonly environmentId: EnvironmentId;
  readonly previewSessions: Readonly<Record<string, ThreadPreviewState>>;
  readonly visibleRuntimeTabIds: ReadonlyArray<string>;
}): PreviewAutomationLiveTab[] {
  return Object.entries(input.previewSessions).flatMap(([key, state]) => {
    const ref = parseScopedThreadKey(key);
    if (ref?.environmentId !== input.environmentId) return [];
    return Object.values(state.sessions)
      .filter((tab) => state.desktopByTabId[tab.tabId]?.hasWebContents)
      .map((tab) => ({
        threadId: ref.threadId,
        tabId: tab.tabId,
        visible: input.visibleRuntimeTabIds.includes(
          previewRuntimeTabId(ref, state.serverEpoch, tab.tabId),
        ),
      }));
  });
}

/**
 * The focus report sent to the server broker. A hidden document is neither
 * focused nor showing any tab, whatever the surface store says.
 */
export function buildPreviewAutomationFocusReport(input: {
  readonly clientId: string;
  readonly environmentId: EnvironmentId;
  readonly connectionId: string;
  readonly hasFocus: boolean;
  readonly documentVisible: boolean;
  readonly liveTabs: ReadonlyArray<PreviewAutomationLiveTab>;
}): PreviewAutomationHostFocus {
  return {
    clientId: input.clientId,
    environmentId: input.environmentId,
    connectionId: input.connectionId,
    focused: input.hasFocus && input.documentVisible,
    liveTabs: input.liveTabs.map((tab) => ({
      ...tab,
      visible: tab.visible === true && input.documentVisible,
    })),
  };
}
