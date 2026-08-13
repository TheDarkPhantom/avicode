export const RIGHT_PANEL_INLINE_LAYOUT_MEDIA_QUERY = "(max-width: 980px)";
export const RIGHT_PANEL_CHAT_WIDTH_STORAGE_KEY = "t3code:right-panel-chat-width";
export const RIGHT_PANEL_LEGACY_WIDTH_STORAGE_KEY = "t3code:preview-panel-width";
export const RIGHT_PANEL_DEFAULT_WIDTH = 540;
export const RIGHT_PANEL_MIN_WIDTH = 360;
export const RIGHT_PANEL_MIN_CHAT_WIDTH = 360;
export const RIGHT_PANEL_SHEET_CLASS_NAME =
  "w-[min(42vw,28rem)] min-w-80 max-w-[28rem] p-0 max-[760px]:w-[min(88vw,24rem)] max-[760px]:min-w-0 wco:mt-[env(titlebar-area-height)] wco:h-[calc(100%-env(titlebar-area-height))] wco:max-h-[calc(100%-env(titlebar-area-height))]";

function finiteOrNull(value: number | null): number | null {
  return value !== null && Number.isFinite(value) ? value : null;
}

export function resolveInitialRightPanelChatWidth(input: {
  containerWidth: number;
  storedChatWidth: number | null;
  legacyPanelWidth: number | null;
}): number {
  const storedChatWidth = finiteOrNull(input.storedChatWidth);
  if (storedChatWidth !== null && storedChatWidth >= RIGHT_PANEL_MIN_CHAT_WIDTH) {
    return Math.round(storedChatWidth);
  }

  const availableWidth = Math.max(0, Math.floor(input.containerWidth));
  const legacyPanelWidth = finiteOrNull(input.legacyPanelWidth);
  const panelWidth = Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    legacyPanelWidth !== null && legacyPanelWidth >= RIGHT_PANEL_MIN_WIDTH
      ? legacyPanelWidth
      : RIGHT_PANEL_DEFAULT_WIDTH,
  );
  return Math.max(RIGHT_PANEL_MIN_CHAT_WIDTH, Math.round(availableWidth - panelWidth));
}

export function clampRightPanelChatWidth(value: number, containerWidth: number): number {
  const maximum = Math.max(
    RIGHT_PANEL_MIN_CHAT_WIDTH,
    Math.floor(containerWidth) - RIGHT_PANEL_MIN_WIDTH,
  );
  return Math.max(RIGHT_PANEL_MIN_CHAT_WIDTH, Math.min(maximum, Math.round(value)));
}

export function resizeRightPanelChatWidthFromKey(input: {
  key: "ArrowLeft" | "ArrowRight";
  shiftKey: boolean;
  currentWidth: number;
  containerWidth: number;
}): number {
  const direction = input.key === "ArrowRight" ? 1 : -1;
  const step = input.shiftKey ? 50 : 10;
  return clampRightPanelChatWidth(input.currentWidth + direction * step, input.containerWidth);
}

export function resolveRightPanelLayout(containerWidth: number, preferredChatWidth: number) {
  const width = Math.max(0, Math.floor(containerWidth));
  const chatWidth = Math.max(RIGHT_PANEL_MIN_CHAT_WIDTH, Math.round(preferredChatWidth));
  const panelWidth = Math.max(0, width - chatWidth);
  return {
    chatWidth,
    panelWidth,
    fitsInline: panelWidth >= RIGHT_PANEL_MIN_WIDTH,
  } as const;
}

/**
 * Browser zoom changes the renderer's CSS-pixel viewport without changing the native window.
 * Keep the panel's CSS width stable and let the chat absorb that viewport delta.
 */
export function rebaseRightPanelChatWidthForZoom(input: {
  previousContainerWidth: number;
  nextContainerWidth: number;
  previousChatWidth: number;
}): number {
  const previousPanelWidth = Math.max(
    RIGHT_PANEL_MIN_WIDTH,
    Math.floor(input.previousContainerWidth) - Math.round(input.previousChatWidth),
  );
  return clampRightPanelChatWidth(
    Math.floor(input.nextContainerWidth) - previousPanelWidth,
    input.nextContainerWidth,
  );
}
