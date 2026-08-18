import { isWindowsPlatform } from "./utils";
import { subscribeToAppZoomLevel } from "../appZoom";

const WCO_CLASS_NAME = "wco";
const ELECTRON_CLASS_NAME = "electron";
const ELECTRON_WINDOWS_CLASS_NAME = "electron-windows";

interface WindowControlsOverlayLike {
  readonly visible: boolean;
  getTitlebarAreaRect?(): DOMRect;
  addEventListener(type: "geometrychange", listener: EventListener): void;
  removeEventListener(type: "geometrychange", listener: EventListener): void;
}

interface NavigatorWithWindowControlsOverlay extends Navigator {
  readonly windowControlsOverlay?: WindowControlsOverlayLike;
}

function getWindowControlsOverlay(): WindowControlsOverlayLike | null {
  if (typeof navigator === "undefined") {
    return null;
  }

  return (navigator as NavigatorWithWindowControlsOverlay).windowControlsOverlay ?? null;
}

const OVERLAY_STYLE_PROPERTIES = [
  "--workspace-topbar-height",
  "--workspace-controls-top",
  "--workspace-controls-left",
  "--workspace-controls-right",
  "--workspace-native-controls-inset",
] as const;

export function resolveWindowControlsOverlayGeometry(input: {
  readonly rect: Pick<DOMRect, "height" | "width" | "x" | "y">;
  readonly viewportWidth: number;
}) {
  const x = Math.max(0, input.rect.x);
  const y = Math.max(0, input.rect.y);
  const width = Math.max(0, input.rect.width);
  const height = Math.max(0, input.rect.height);
  const rightInset = Math.max(0, input.viewportWidth - x - width);
  return { height, rightInset, x, y } as const;
}

function clearWindowControlsOverlayGeometry(): void {
  for (const property of OVERLAY_STYLE_PROPERTIES) {
    document.documentElement.style.removeProperty(property);
  }
}

/**
 * Avi Code addition: decide whether a freshly measured caption-button inset is safe to
 * apply. Opening the right panel grows the native window asynchronously; during the grow
 * `window.innerWidth` updates a frame or two before `getTitlebarAreaRect()` catches up, so
 * a resize-driven read briefly reports a much larger `rightInset` and shoves the panel
 * toggle inward. The native-controls band never widens on a plain resize, so reject a
 * non-authoritative read that inflates the inset above the last stable value and wait for
 * the authoritative `geometrychange` snapshot. The first value (no prior) always applies.
 */
export function shouldApplyWindowControlsOverlayInset(input: {
  readonly candidateRightInset: number;
  readonly lastAppliedRightInset: number | null;
  readonly authoritative: boolean;
}): boolean {
  if (input.authoritative || input.lastAppliedRightInset === null) {
    return true;
  }
  return input.candidateRightInset <= input.lastAppliedRightInset;
}

function applyResolvedWindowControlsOverlayGeometry(
  geometry: ReturnType<typeof resolveWindowControlsOverlayGeometry>,
): void {
  const style = document.documentElement.style;
  style.setProperty("--workspace-topbar-height", `${geometry.height}px`);
  style.setProperty("--workspace-controls-top", `${geometry.y}px`);
  style.setProperty("--workspace-controls-left", `calc(${geometry.x}px + 0.75rem)`);
  style.setProperty("--workspace-controls-right", `calc(${geometry.rightInset}px + 0.75rem)`);
  style.setProperty(
    "--workspace-native-controls-inset",
    `calc(${geometry.rightInset}px + 0.75rem)`,
  );
}

export function syncDocumentWindowControlsOverlayClass(): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const overlay = getWindowControlsOverlay();

  const syncClass = () => {
    document.documentElement.classList.toggle(WCO_CLASS_NAME, overlay !== null && overlay.visible);
  };

  // Avi Code addition: coalesce geometry reads into a frame and reject mid-grow transients
  // (see shouldApplyWindowControlsOverlayInset). `geometrychange` and zoom are authoritative
  // self-consistent snapshots; a bare `resize` may read a stale titlebar rect.
  let frame: number | null = null;
  let pendingAuthoritative = false;
  let lastAppliedRightInset: number | null = null;

  const applyGeometry = () => {
    frame = null;
    const authoritative = pendingAuthoritative;
    pendingAuthoritative = false;
    if (!overlay || !overlay.visible || typeof overlay.getTitlebarAreaRect !== "function") {
      clearWindowControlsOverlayGeometry();
      lastAppliedRightInset = null;
      return;
    }
    const geometry = resolveWindowControlsOverlayGeometry({
      rect: overlay.getTitlebarAreaRect(),
      viewportWidth: window.innerWidth,
    });
    if (geometry.height === 0) {
      clearWindowControlsOverlayGeometry();
      lastAppliedRightInset = null;
      return;
    }
    if (
      !shouldApplyWindowControlsOverlayInset({
        candidateRightInset: geometry.rightInset,
        lastAppliedRightInset,
        authoritative,
      })
    ) {
      return;
    }
    applyResolvedWindowControlsOverlayGeometry(geometry);
    lastAppliedRightInset = geometry.rightInset;
  };

  const scheduleGeometry = (authoritative: boolean) => {
    if (authoritative) {
      pendingAuthoritative = true;
    }
    if (frame !== null) {
      return;
    }
    frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(applyGeometry)
        : (applyGeometry(), null);
  };

  const onAuthoritative = () => {
    syncClass();
    scheduleGeometry(true);
  };
  const onResize = () => {
    syncClass();
    scheduleGeometry(false);
  };

  onAuthoritative();
  if (!overlay) {
    return () => {};
  }

  overlay.addEventListener("geometrychange", onAuthoritative);
  window.addEventListener("resize", onResize);
  const unsubscribeFromZoom = subscribeToAppZoomLevel(onAuthoritative);
  return () => {
    if (frame !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(frame);
    }
    overlay.removeEventListener("geometrychange", onAuthoritative);
    window.removeEventListener("resize", onResize);
    unsubscribeFromZoom();
    clearWindowControlsOverlayGeometry();
  };
}

export function getElectronPlatformClassNames(
  platform: string,
):
  | readonly [typeof ELECTRON_CLASS_NAME]
  | readonly [typeof ELECTRON_CLASS_NAME, typeof ELECTRON_WINDOWS_CLASS_NAME] {
  return isWindowsPlatform(platform)
    ? [ELECTRON_CLASS_NAME, ELECTRON_WINDOWS_CLASS_NAME]
    : [ELECTRON_CLASS_NAME];
}

export function syncDocumentElectronPlatformClasses(platform: string): () => void {
  if (typeof document === "undefined") {
    return () => {};
  }

  const classNames = getElectronPlatformClassNames(platform);
  document.documentElement.classList.add(...classNames);
  return () => {
    document.documentElement.classList.remove(...classNames);
  };
}
