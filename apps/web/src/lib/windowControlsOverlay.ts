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

function applyWindowControlsOverlayGeometry(overlay: WindowControlsOverlayLike): void {
  if (!overlay.visible || typeof overlay.getTitlebarAreaRect !== "function") {
    clearWindowControlsOverlayGeometry();
    return;
  }
  const geometry = resolveWindowControlsOverlayGeometry({
    rect: overlay.getTitlebarAreaRect(),
    viewportWidth: window.innerWidth,
  });
  if (geometry.height === 0) {
    clearWindowControlsOverlayGeometry();
    return;
  }
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
  const update = () => {
    document.documentElement.classList.toggle(WCO_CLASS_NAME, overlay !== null && overlay.visible);
    if (overlay) {
      applyWindowControlsOverlayGeometry(overlay);
    } else {
      clearWindowControlsOverlayGeometry();
    }
  };

  update();
  if (!overlay) {
    return () => {};
  }

  overlay.addEventListener("geometrychange", update);
  window.addEventListener("resize", update);
  const unsubscribeFromZoom = subscribeToAppZoomLevel(update);
  return () => {
    overlay.removeEventListener("geometrychange", update);
    window.removeEventListener("resize", update);
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
