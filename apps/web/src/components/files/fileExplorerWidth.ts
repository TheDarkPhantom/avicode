// Avi Code addition: width rules for the resizable file explorer beside a file preview.
export const FILE_EXPLORER_WIDTH_STORAGE_KEY = "t3code.fileExplorerWidth";
export const FILE_EXPLORER_DEFAULT_WIDTH = 256;
export const FILE_EXPLORER_MIN_WIDTH = 160;
export const FILE_EXPLORER_MAX_WIDTH = 560;
/** The file content keeps at least this much room when the explorer grows. */
export const FILE_CONTENT_MIN_WIDTH = 256;

const KEY_STEP = 16;
const SHIFT_KEY_STEP = 64;

/** Largest explorer width that still leaves the file content usable in a row of `rowWidth`. */
export function resolveFileExplorerMaxWidth(rowWidth: number): number {
  if (!Number.isFinite(rowWidth) || rowWidth <= 0) return FILE_EXPLORER_MAX_WIDTH;
  return Math.max(
    FILE_EXPLORER_MIN_WIDTH,
    Math.min(FILE_EXPLORER_MAX_WIDTH, Math.floor(rowWidth) - FILE_CONTENT_MIN_WIDTH),
  );
}

export function clampFileExplorerWidth(value: number, maxWidth: number): number {
  const maximum = Math.max(FILE_EXPLORER_MIN_WIDTH, Math.min(FILE_EXPLORER_MAX_WIDTH, maxWidth));
  const width = Number.isFinite(value) ? Math.round(value) : FILE_EXPLORER_DEFAULT_WIDTH;
  return Math.max(FILE_EXPLORER_MIN_WIDTH, Math.min(maximum, width));
}

/**
 * Keyboard resizing for the explorer's left-edge separator. ArrowLeft grows the explorer,
 * ArrowRight shrinks it, Home and End jump to the bounds. Returns null for other keys.
 */
export function resizeFileExplorerWidthFromKey(input: {
  key: string;
  shiftKey: boolean;
  currentWidth: number;
  maxWidth: number;
}): number | null {
  const step = input.shiftKey ? SHIFT_KEY_STEP : KEY_STEP;
  switch (input.key) {
    case "ArrowLeft":
      return clampFileExplorerWidth(input.currentWidth + step, input.maxWidth);
    case "ArrowRight":
      return clampFileExplorerWidth(input.currentWidth - step, input.maxWidth);
    case "Home":
      return FILE_EXPLORER_MIN_WIDTH;
    case "End":
      return clampFileExplorerWidth(input.maxWidth, input.maxWidth);
    default:
      return null;
  }
}
