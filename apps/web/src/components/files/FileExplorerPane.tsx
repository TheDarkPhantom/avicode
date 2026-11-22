// Avi Code addition: resizable host for the file explorer beside a file preview.
import * as Schema from "effect/Schema";
import {
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import { RightPanelResizeHandle } from "~/components/preview/RightPanelResizeHandle";
import { getLocalStorageItem, setLocalStorageItem } from "~/hooks/useLocalStorage";
import type { RightPanelSeparatorHandlers } from "~/hooks/useRightPanelSplitLayout";
import { cn } from "~/lib/utils";

import {
  clampFileExplorerWidth,
  FILE_EXPLORER_DEFAULT_WIDTH,
  FILE_EXPLORER_MAX_WIDTH,
  FILE_EXPLORER_MIN_WIDTH,
  FILE_EXPLORER_WIDTH_STORAGE_KEY,
  resizeFileExplorerWidthFromKey,
  resolveFileExplorerMaxWidth,
} from "./fileExplorerWidth";

const WidthSchema = Schema.Finite;

function readStoredWidth(): number {
  try {
    return (
      getLocalStorageItem(FILE_EXPLORER_WIDTH_STORAGE_KEY, WidthSchema) ??
      FILE_EXPLORER_DEFAULT_WIDTH
    );
  } catch (error) {
    console.error("Could not read persisted file explorer width.", error);
    return FILE_EXPLORER_DEFAULT_WIDTH;
  }
}

function persistWidth(width: number) {
  // Resizing stays usable for this session when browser storage is unavailable.
  try {
    setLocalStorageItem(FILE_EXPLORER_WIDTH_STORAGE_KEY, width, WidthSchema);
  } catch (error) {
    console.error("Could not persist file explorer width.", error);
  }
}

/**
 * Hosts the file explorer. When `resizable` (a file is open beside it) the explorer gets a
 * left-edge drag handle and a persisted width; otherwise it fills the row.
 */
export function FileExplorerPane({
  resizable,
  children,
}: {
  resizable: boolean;
  children: ReactNode;
}) {
  const [preferredWidth, setPreferredWidth] = useState(readStoredWidth);
  const [maxWidth, setMaxWidth] = useState(FILE_EXPLORER_MAX_WIDTH);
  const [active, setActive] = useState(false);
  const width = clampFileExplorerWidth(preferredWidth, maxWidth);
  const widthRef = useRef(width);
  widthRef.current = width;
  const maxWidthRef = useRef(maxWidth);
  maxWidthRef.current = maxWidth;
  const keyboardDirtyRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    pendingWidth: number;
    frame: number | null;
    target: HTMLElement;
  } | null>(null);

  const hostRef = useCallback(
    (host: HTMLElement | null) => {
      const row = host?.parentElement;
      if (!row || !resizable) return;
      const measure = () => setMaxWidth(resolveFileExplorerMaxWidth(row.clientWidth));
      measure();
      if (typeof ResizeObserver === "undefined") return;
      const observer = new ResizeObserver(measure);
      observer.observe(row);
      return () => observer.disconnect();
    },
    [resizable],
  );

  const releasePointer = useCallback((pointerId: number) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (drag.frame !== null) cancelAnimationFrame(drag.frame);
    try {
      if (drag.target.hasPointerCapture(pointerId)) drag.target.releasePointerCapture(pointerId);
    } catch {
      // Pointer capture may already have been released by the browser.
    }
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
    dragRef.current = null;
    setActive(false);
  }, []);

  useEffect(
    () => () => {
      const drag = dragRef.current;
      if (drag?.frame != null) cancelAnimationFrame(drag.frame);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    },
    [],
  );

  const commitKeyboardResize = useCallback(() => {
    if (!keyboardDirtyRef.current) return;
    keyboardDirtyRef.current = false;
    setActive(false);
    persistWidth(widthRef.current);
  }, []);

  const handlers: RightPanelSeparatorHandlers = {
    onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      const target = event.currentTarget;
      try {
        target.setPointerCapture(event.pointerId);
      } catch {
        return;
      }
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      setActive(true);
      dragRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: widthRef.current,
        pendingWidth: widthRef.current,
        frame: null,
        target,
      };
    },
    onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      // The handle sits on the explorer's left edge, so dragging left grows it.
      drag.pendingWidth = clampFileExplorerWidth(
        drag.startWidth - (event.clientX - drag.startX),
        maxWidthRef.current,
      );
      if (drag.frame !== null) return;
      drag.frame = requestAnimationFrame(() => {
        const current = dragRef.current;
        if (!current) return;
        current.frame = null;
        setPreferredWidth(current.pendingWidth);
      });
    },
    onPointerUp: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const finalWidth = drag.pendingWidth;
      releasePointer(event.pointerId);
      setPreferredWidth(finalWidth);
      persistWidth(finalWidth);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const startWidth = drag.startWidth;
      releasePointer(event.pointerId);
      setPreferredWidth(startWidth);
    },
    onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const nextWidth = resizeFileExplorerWidthFromKey({
        key: event.key,
        shiftKey: event.shiftKey,
        currentWidth: widthRef.current,
        maxWidth: maxWidthRef.current,
      });
      if (nextWidth === null) return;
      event.preventDefault();
      event.stopPropagation();
      keyboardDirtyRef.current = true;
      setActive(true);
      setPreferredWidth(nextWidth);
    },
    onKeyUp: () => commitKeyboardResize(),
    onBlur: () => commitKeyboardResize(),
  };

  return (
    <aside
      ref={hostRef}
      aria-label="File explorer"
      className={cn(
        "relative flex min-h-0 min-w-0 shrink-0 bg-background",
        resizable ? "border-l border-border/60" : "flex-1",
      )}
      style={resizable ? { width: `${width}px` } : undefined}
    >
      {resizable ? (
        <RightPanelResizeHandle
          handlers={handlers}
          label="Resize file explorer"
          value={width}
          minimum={FILE_EXPLORER_MIN_WIDTH}
          maximum={maxWidth}
          active={active}
        />
      ) : null}
      {children}
    </aside>
  );
}
