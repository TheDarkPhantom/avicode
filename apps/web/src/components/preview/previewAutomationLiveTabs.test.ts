import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId, type PreviewSessionSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { previewRuntimeTabId } from "~/browser/previewRuntimeTabId";
import type { DesktopPreviewOverlay, ThreadPreviewState } from "~/previewStateStore";

import {
  buildPreviewAutomationFocusReport,
  collectPreviewAutomationLiveTabs,
} from "./previewAutomationLiveTabs";

const environmentId = EnvironmentId.make("automation-environment");
const otherEnvironmentId = EnvironmentId.make("other-environment");
const threadId = ThreadId.make("automation-thread");
const threadRef = { environmentId, threadId };

const session = (tabId: string): PreviewSessionSnapshot => ({
  threadId,
  tabId,
  navStatus: { _tag: "Idle" },
  canGoBack: false,
  canGoForward: false,
  updatedAt: "2026-09-05T00:00:00.000Z",
});

const overlay = (hasWebContents: boolean): DesktopPreviewOverlay => ({
  hasWebContents,
  canGoBack: false,
  canGoForward: false,
  loading: false,
  zoomFactor: 1,
  pictureInPicture: false,
  colorScheme: "system",
  controller: "none",
});

const threadState = (input: {
  readonly tabs: ReadonlyArray<string>;
  readonly desktop: Record<string, DesktopPreviewOverlay>;
}): ThreadPreviewState => ({
  snapshot: null,
  sessions: Object.fromEntries(input.tabs.map((tabId) => [tabId, session(tabId)])),
  suppressedTabIds: new Set(),
  activeTabId: input.tabs[0] ?? null,
  desktopOverlay: null,
  desktopByTabId: input.desktop,
  recentlySeenUrls: [],
  serverEpoch: "test-server",
  serverRevision: 0,
});

describe("collectPreviewAutomationLiveTabs", () => {
  it("reports only tabs whose web contents exist locally", () => {
    const previewSessions = {
      [scopedThreadKey(threadRef)]: threadState({
        tabs: ["live", "snapshot-only", "closed"],
        desktop: { live: overlay(true), closed: overlay(false) },
      }),
    };
    expect(
      collectPreviewAutomationLiveTabs({
        environmentId,
        previewSessions,
        visibleRuntimeTabIds: [],
      }),
    ).toEqual([{ threadId, tabId: "live", visible: false }]);
  });

  it("marks presented tabs visible and ignores other environments", () => {
    const otherRef = { environmentId: otherEnvironmentId, threadId };
    const previewSessions = {
      [scopedThreadKey(threadRef)]: threadState({
        tabs: ["shown", "background"],
        desktop: { shown: overlay(true), background: overlay(true) },
      }),
      [scopedThreadKey(otherRef)]: threadState({
        tabs: ["foreign"],
        desktop: { foreign: overlay(true) },
      }),
    };
    expect(
      collectPreviewAutomationLiveTabs({
        environmentId,
        previewSessions,
        visibleRuntimeTabIds: [
          previewRuntimeTabId(threadRef, "test-server", "shown"),
          previewRuntimeTabId(otherRef, "test-server", "foreign"),
        ],
      }),
    ).toEqual([
      { threadId, tabId: "shown", visible: true },
      { threadId, tabId: "background", visible: false },
    ]);
  });
});

describe("buildPreviewAutomationFocusReport", () => {
  const base = {
    clientId: "client",
    environmentId,
    connectionId: "connection",
    liveTabs: [{ threadId, tabId: "shown", visible: true }],
  };

  it("passes focus and visibility through while the document is visible", () => {
    expect(
      buildPreviewAutomationFocusReport({ ...base, hasFocus: true, documentVisible: true }),
    ).toEqual({
      clientId: "client",
      environmentId,
      connectionId: "connection",
      focused: true,
      liveTabs: [{ threadId, tabId: "shown", visible: true }],
    });
  });

  it("reports a hidden document as unfocused with no visible tabs", () => {
    expect(
      buildPreviewAutomationFocusReport({ ...base, hasFocus: true, documentVisible: false }),
    ).toMatchObject({
      focused: false,
      liveTabs: [{ threadId, tabId: "shown", visible: false }],
    });
  });
});
