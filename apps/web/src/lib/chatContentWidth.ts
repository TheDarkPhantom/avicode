import type { AviCodeChatContentWidth } from "@t3tools/contracts";

/**
 * Avi Code addition. One source of truth for how wide the chat column may grow.
 *
 * Upstream repeated `max-w-3xl` across six chat-column call sites and hard-coded
 * the same 768 in `MessagesTimeline.logic`'s minimap gutter maths. Those two
 * representations could drift silently — the minimap would float away from the
 * column with no test catching it. Now the CSS custom property and the pixel
 * figure both come from here.
 *
 * `full` is `Infinity` rather than a large number so the gutter maths collapses
 * to "no gutter" exactly, instead of at some arbitrary viewport size.
 */
export const CHAT_CONTENT_WIDTHS = {
  comfortable: { css: "48rem", px: 768 },
  wide: { css: "72rem", px: 1152 },
  full: { css: "100%", px: Number.POSITIVE_INFINITY },
} as const satisfies Record<AviCodeChatContentWidth, { readonly css: string; readonly px: number }>;

export function chatContentMaxWidthCss(width: AviCodeChatContentWidth): string {
  return CHAT_CONTENT_WIDTHS[width].css;
}

export function chatContentMaxWidthPx(width: AviCodeChatContentWidth): number {
  return CHAT_CONTENT_WIDTHS[width].px;
}
