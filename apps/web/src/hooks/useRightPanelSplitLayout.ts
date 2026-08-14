import * as Schema from "effect/Schema";
import {
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { appCssPixelsToWindowUnits, getAppZoomLevel, subscribeToAppZoomLevel } from "../appZoom";
import { isElectron } from "../env";
import { getLocalStorageItem, setLocalStorageItem } from "./useLocalStorage";
import {
  clampRightPanelChatWidth,
  resizeRightPanelChatWidthFromKey,
  resolveInitialRightPanelChatWidth,
  rebaseRightPanelChatWidthForZoom,
  resolveRightPanelLayout,
  RIGHT_PANEL_CHAT_WIDTH_STORAGE_KEY,
  RIGHT_PANEL_DEFAULT_WIDTH,
  RIGHT_PANEL_LEGACY_WIDTH_STORAGE_KEY,
  RIGHT_PANEL_MIN_CHAT_WIDTH,
  RIGHT_PANEL_MIN_WIDTH,
} from "../rightPanelLayout";

const WidthSchema = Schema.Finite;

// Avi Code addition: keep native-window layout state across chat route remounts.
let desktopPreferredChatWidth: number | null = null;
let desktopPanelReservationOpen = false;
let desktopPanelReservationClosing = false;
let desktopLastUsablePanelWidth: number | null = null;

export function shouldSyncClosedDesktopChatWidth(input: {
  panelOpen: boolean;
  reservationOpen: boolean;
  reservationClosing: boolean;
}): boolean {
  return !input.panelOpen && !input.reservationOpen && !input.reservationClosing;
}

export function resolveClosedDesktopChatWidth(input: {
  measuredWidth: number;
  preferredWidth: number;
  panelOpen: boolean;
  reservationOpen: boolean;
  reservationClosing: boolean;
}): number {
  return shouldSyncClosedDesktopChatWidth(input) ? input.measuredWidth : input.preferredWidth;
}

export interface RightPanelSeparatorHandlers {
  readonly onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerMove: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerUp: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onPointerCancel: (event: ReactPointerEvent<HTMLElement>) => void;
  readonly onKeyDown: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly onKeyUp: (event: ReactKeyboardEvent<HTMLElement>) => void;
  readonly onBlur: (event: ReactFocusEvent<HTMLElement>) => void;
}

function readStoredWidth(key: string): number | null {
  try {
    return getLocalStorageItem(key, WidthSchema);
  } catch (error) {
    console.error("Could not read persisted split-pane width.", error);
    return null;
  }
}

export function useRightPanelSplitLayout(options: { panelOpen: boolean }) {
  const [container, setContainer] = useState<HTMLElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [preferredChatWidth, setPreferredChatWidthState] = useState<number | null>(() =>
    isElectron ? desktopPreferredChatWidth : null,
  );
  const [active, setActive] = useState(false);
  const preferredChatWidthRef = useRef<number | null>(
    isElectron ? desktopPreferredChatWidth : null,
  );
  const keyboardDirtyRef = useRef(false);
  const panelOpenRef = useRef(options.panelOpen);
  panelOpenRef.current = options.panelOpen;
  const lastMeasurementRef = useRef({
    containerWidth: 0,
    zoomLevel: getAppZoomLevel(),
  });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startWidth: number;
    pendingWidth: number;
    frame: number | null;
    target: HTMLElement;
  } | null>(null);

  const setPreferredChatWidth = useCallback((width: number) => {
    preferredChatWidthRef.current = width;
    if (isElectron) desktopPreferredChatWidth = width;
    setPreferredChatWidthState(width);
  }, []);

  const containerRef = useCallback((node: HTMLDivElement | null) => {
    setContainer(node);
  }, []);

  useLayoutEffect(() => {
    if (!container) return;
    const measure = () => {
      const width = Math.floor(container.clientWidth);
      const zoomLevel = getAppZoomLevel();
      const previousMeasurement = lastMeasurementRef.current;
      lastMeasurementRef.current = { containerWidth: width, zoomLevel };
      setContainerWidth(width);
      if (width <= 0) return;
      const currentPreferredWidth = preferredChatWidthRef.current;
      if (currentPreferredWidth !== null) {
        if (isElectron && !panelOpenRef.current) {
          const nextPreferredWidth = resolveClosedDesktopChatWidth({
            measuredWidth: width,
            preferredWidth: currentPreferredWidth,
            panelOpen: panelOpenRef.current,
            reservationOpen: desktopPanelReservationOpen,
            reservationClosing: desktopPanelReservationClosing,
          });
          if (nextPreferredWidth !== currentPreferredWidth) {
            setPreferredChatWidth(nextPreferredWidth);
          }
          return;
        }
        if (
          panelOpenRef.current &&
          previousMeasurement.containerWidth > 0 &&
          previousMeasurement.zoomLevel !== zoomLevel
        ) {
          setPreferredChatWidth(
            rebaseRightPanelChatWidthForZoom({
              previousContainerWidth: previousMeasurement.containerWidth,
              nextContainerWidth: width,
              previousChatWidth: currentPreferredWidth,
            }),
          );
        }
        return;
      }
      const initialWidth = isElectron
        ? width
        : resolveInitialRightPanelChatWidth({
            containerWidth: width,
            storedChatWidth: readStoredWidth(RIGHT_PANEL_CHAT_WIDTH_STORAGE_KEY),
            legacyPanelWidth: readStoredWidth(RIGHT_PANEL_LEGACY_WIDTH_STORAGE_KEY),
          });
      setPreferredChatWidth(initialWidth);
    };
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(container);
    return () => observer?.disconnect();
  }, [container, setPreferredChatWidth]);

  useLayoutEffect(() => {
    if (isElectron || options.panelOpen || containerWidth <= 0) return;
    setPreferredChatWidth(containerWidth);
  }, [containerWidth, options.panelOpen, setPreferredChatWidth]);

  const syncClosedContainerWidth = useCallback(() => {
    if (panelOpenRef.current || !container) return;
    const width = Math.floor(container.clientWidth);
    if (width > 0) setPreferredChatWidth(width);
  }, [container, setPreferredChatWidth]);

  const persist = useCallback((width: number) => {
    try {
      setLocalStorageItem(RIGHT_PANEL_CHAT_WIDTH_STORAGE_KEY, width, WidthSchema);
    } catch (error) {
      console.error("Could not persist split-pane width.", error);
    }
  }, []);

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

  const onPointerDown = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    const currentWidth = preferredChatWidthRef.current;
    if (event.button !== 0 || currentWidth === null) return;
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
      startWidth: currentWidth,
      pendingWidth: currentWidth,
      frame: null,
      target,
    };
  }, []);

  const onPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      drag.pendingWidth = clampRightPanelChatWidth(
        drag.startWidth + event.clientX - drag.startX,
        containerWidth,
      );
      if (drag.frame !== null) return;
      drag.frame = requestAnimationFrame(() => {
        const current = dragRef.current;
        if (!current) return;
        current.frame = null;
        setPreferredChatWidth(current.pendingWidth);
      });
    },
    [containerWidth, setPreferredChatWidth],
  );

  const onPointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const finalWidth = drag.pendingWidth;
      releasePointer(event.pointerId);
      setPreferredChatWidth(finalWidth);
      persist(finalWidth);
    },
    [persist, releasePointer, setPreferredChatWidth],
  );

  const onPointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const startWidth = drag.startWidth;
      releasePointer(event.pointerId);
      setPreferredChatWidth(startWidth);
    },
    [releasePointer, setPreferredChatWidth],
  );

  const commitKeyboardResize = useCallback(() => {
    if (!keyboardDirtyRef.current) return;
    keyboardDirtyRef.current = false;
    setActive(false);
    const width = preferredChatWidthRef.current;
    if (width !== null) persist(width);
  }, [persist]);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      const currentWidth = preferredChatWidthRef.current;
      if (currentWidth === null) return;
      event.preventDefault();
      event.stopPropagation();
      const nextWidth = resizeRightPanelChatWidthFromKey({
        key: event.key,
        shiftKey: event.shiftKey,
        currentWidth,
        containerWidth,
      });
      keyboardDirtyRef.current = true;
      setActive(true);
      setPreferredChatWidth(nextWidth);
    },
    [containerWidth, setPreferredChatWidth],
  );

  const onKeyUp = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      commitKeyboardResize();
    },
    [commitKeyboardResize],
  );

  const onBlur = useCallback(
    (_event: ReactFocusEvent<HTMLElement>) => commitKeyboardResize(),
    [commitKeyboardResize],
  );

  const layout =
    preferredChatWidth === null
      ? null
      : resolveRightPanelLayout(containerWidth, preferredChatWidth);
  const separatorMaximum = Math.max(
    RIGHT_PANEL_MIN_CHAT_WIDTH,
    containerWidth - RIGHT_PANEL_MIN_WIDTH,
  );

  return {
    containerRef,
    preferredChatWidth,
    containerWidth,
    layout,
    active,
    separatorMinimum: RIGHT_PANEL_MIN_CHAT_WIDTH,
    separatorMaximum,
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onKeyDown,
      onKeyUp,
      onBlur,
    } satisfies RightPanelSeparatorHandlers,
    syncClosedContainerWidth,
  };
}

export function useDesktopRightPanelWindowReservation(options: {
  open: boolean;
  panelWidth: number | null;
  onCloseSettled: () => void;
}) {
  const zoomLevel = useSyncExternalStore(subscribeToAppZoomLevel, getAppZoomLevel, () => 0);
  const reservationOpenRef = useRef(desktopPanelReservationOpen);
  const hasMeasuredOpenPanelRef = useRef(false);
  const lastUsablePanelWidthRef = useRef(
    desktopLastUsablePanelWidth ??
      Math.max(
        RIGHT_PANEL_MIN_WIDTH,
        readStoredWidth(RIGHT_PANEL_LEGACY_WIDTH_STORAGE_KEY) ?? RIGHT_PANEL_DEFAULT_WIDTH,
      ),
  );

  const toWindowUnits = useCallback(
    (width: number) => appCssPixelsToWindowUnits(width, zoomLevel),
    [zoomLevel],
  );

  useLayoutEffect(() => {
    if (!isElectron) return;
    const bridge = window.desktopBridge?.setPanelWindowReservation;
    if (typeof bridge !== "function" || reservationOpenRef.current === options.open) return;
    reservationOpenRef.current = options.open;
    desktopPanelReservationOpen = options.open;
    desktopPanelReservationClosing = !options.open;
    hasMeasuredOpenPanelRef.current = false;
    const operation = bridge({
      action: options.open ? "open" : "close",
      width: options.open ? toWindowUnits(lastUsablePanelWidthRef.current) : 0,
    });
    if (options.open) {
      desktopPanelReservationClosing = false;
      void operation;
      return;
    }
    const settleClose = () => {
      window.requestAnimationFrame(() => {
        if (reservationOpenRef.current) return;
        desktopPanelReservationClosing = false;
        options.onCloseSettled();
      });
    };
    void operation.then(settleClose, settleClose);
  }, [options.onCloseSettled, options.open, toWindowUnits]);

  useEffect(() => {
    if (!isElectron || !options.open || options.panelWidth === null) {
      return;
    }
    const width = Math.max(0, Math.round(options.panelWidth));
    if (width === 0 && !hasMeasuredOpenPanelRef.current) return;
    hasMeasuredOpenPanelRef.current = true;
    void window.desktopBridge?.setPanelWindowReservation?.({
      action: "update",
      width: toWindowUnits(width),
    });
    if (width < RIGHT_PANEL_MIN_WIDTH) return;
    lastUsablePanelWidthRef.current = width;
    desktopLastUsablePanelWidth = width;
    const handle = window.setTimeout(() => {
      try {
        setLocalStorageItem(RIGHT_PANEL_LEGACY_WIDTH_STORAGE_KEY, width, WidthSchema);
      } catch (error) {
        console.error("Could not persist side-panel width.", error);
      }
    }, 150);
    return () => window.clearTimeout(handle);
  }, [options.open, options.panelWidth, toWindowUnits]);
}
