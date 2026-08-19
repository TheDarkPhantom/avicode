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
  /** Avi Code addition: lets the empty state start the project's dev server. */
  startDevServerLabel?: string | null;
  onStartDevServer?: (() => void) | undefined;
  visible: boolean;
  /** Avi Code addition: forwarded so only the focused split pane takes keybinds. */
  focused?: boolean;
}

export function PreviewPanel({
  mode,
  threadRef,
  tabId,
  configuredUrls,
  projectRoot = null,
  worktreePath = null,
  startDevServerLabel = null,
  onStartDevServer,
  visible,
  focused = true,
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
        startDevServerLabel={startDevServerLabel}
        onStartDevServer={onStartDevServer}
        visible={visible}
        focused={focused}
      />
    </PreviewPanelShell>
  );
}
