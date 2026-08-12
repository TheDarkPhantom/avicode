import { type ReactNode } from "react";

import { isElectron } from "~/env";
import type { RightPanelSeparatorHandlers } from "~/hooks/useRightPanelSplitLayout";
import { cn } from "~/lib/utils";
import { RIGHT_PANEL_DEFAULT_WIDTH, RIGHT_PANEL_MIN_WIDTH } from "~/rightPanelLayout";

import { RightPanelResizeHandle } from "./RightPanelResizeHandle";

export type PreviewPanelMode = "inline" | "sheet" | "sidebar" | "embedded";

export interface RightPanelSplitPaneProps {
  handlers: RightPanelSeparatorHandlers;
  value: number;
  minimum: number;
  maximum: number;
  active: boolean;
}

/**
 * Shell for the preview panel. In inline mode the panel is user-resizable
 * via a drag handle on the left edge; width persists per browser. In
 * sheet/sidebar modes the parent owns the size.
 */
export function PreviewPanelShell(props: {
  mode: PreviewPanelMode;
  maximized?: boolean;
  splitPane?: RightPanelSplitPaneProps;
  children: ReactNode;
}) {
  const useDragRegion = isElectron && props.mode !== "sheet" && props.mode !== "embedded";
  const isInline = props.mode === "inline";
  return (
    <div
      className={cn(
        "relative flex h-full min-h-0 min-w-0 flex-col self-stretch bg-background",
        isInline
          ? props.maximized
            ? "flex-1 border-l border-border"
            : props.splitPane
              ? "min-w-0 flex-1 border-l border-border"
              : "shrink-0 border-l border-border"
          : "w-full",
      )}
      style={
        isInline && !props.maximized
          ? props.splitPane
            ? { minWidth: `${RIGHT_PANEL_MIN_WIDTH}px` }
            : { width: `${RIGHT_PANEL_DEFAULT_WIDTH}px` }
          : undefined
      }
      data-preview-panel-mode={props.mode}
      data-preview-panel-maximized={props.maximized ? "true" : "false"}
    >
      {isInline && !props.maximized && props.splitPane ? (
        <RightPanelResizeHandle
          handlers={props.splitPane.handlers}
          value={props.splitPane.value}
          minimum={props.splitPane.minimum}
          maximum={props.splitPane.maximum}
          active={props.splitPane.active}
        />
      ) : null}
      {useDragRegion ? <div className="electron-drag-region h-0 w-full" aria-hidden /> : null}
      {props.children}
    </div>
  );
}
