"use client";

import type { ScopedThreadRef } from "@t3tools/contracts";

import { isPreviewSupportedInRuntime } from "~/previewStateStore";

import { PreviewPanelShell, type PreviewPanelMode } from "./PreviewPanelShell";
import type { ConfiguredPreviewUrl } from "./previewEmptyStateLogic";
import { PreviewView } from "./PreviewView";

interface Props {
  mode: PreviewPanelMode;
  threadRef: ScopedThreadRef;
  tabId?: string | null;
  configuredUrls?: ReadonlyArray<ConfiguredPreviewUrl> | undefined;
  /** Avi Code addition: passed through so the start page can group servers. */
  projectRoot?: string | null;
  worktreePath?: string | null;
  visible: boolean;
}

export function PreviewPanel({
  mode,
  threadRef,
  tabId,
  configuredUrls,
  projectRoot = null,
  worktreePath = null,
  visible,
}: Props) {
  if (!isPreviewSupportedInRuntime()) {
    return (
      <PreviewPanelShell mode={mode}>
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="max-w-sm text-sm text-muted-foreground">
            Preview is only available in the Avi Code desktop app.
          </p>
        </div>
      </PreviewPanelShell>
    );
  }

  return (
    <PreviewPanelShell mode={mode}>
      <PreviewView
        threadRef={threadRef}
        {...(tabId !== undefined ? { tabId } : {})}
        configuredUrls={configuredUrls}
        projectRoot={projectRoot}
        worktreePath={worktreePath}
        visible={visible}
      />
    </PreviewPanelShell>
  );
}
