import type { CSSProperties } from "react";

/**
 * Avi Code addition: shared colour handling for quick-send composer chips.
 *
 * A chip stores a palette token (e.g. `"green"`). The token list here is what
 * the settings colour picker offers, and the resolver maps a token to a CSS
 * value so the composer chip and the settings preview tint identically. The
 * tokens intentionally match the keys in `color-selector.tsx`'s `colorMap`, so
 * passing `CHIP_COLOR_TOKENS` to `ColorSelector` renders the same swatches.
 */

// Ordered palette shown in the settings colour picker.
export const CHIP_COLOR_TOKENS = [
  "blue",
  "green",
  "teal",
  "purple",
  "pink",
  "rose",
  "orange",
  "amber",
] as const;

export type ChipColorToken = (typeof CHIP_COLOR_TOKENS)[number];

export const DEFAULT_CHIP_COLOR: ChipColorToken = "blue";

// Token → CSS colour variable. Unknown tokens fall back to the default so an
// old or malformed value still renders a chip rather than breaking layout.
const CHIP_COLOR_VARS: Record<ChipColorToken, string> = {
  blue: "var(--color-blue-500)",
  green: "var(--color-green-500)",
  teal: "var(--color-teal-500)",
  purple: "var(--color-purple-500)",
  pink: "var(--color-pink-500)",
  rose: "var(--color-rose-500)",
  orange: "var(--color-orange-500)",
  amber: "var(--color-amber-500)",
};

export function resolveChipColor(token: string): string {
  return CHIP_COLOR_VARS[token as ChipColorToken] ?? CHIP_COLOR_VARS[DEFAULT_CHIP_COLOR];
}

/**
 * Subtle-tint styling for a chip: a faint background wash plus a slightly
 * stronger left border in the chosen colour, with text left at high contrast.
 * `color-mix` keeps the wash readable in both light and dark themes.
 */
export function chipTintStyle(token: string): CSSProperties {
  const color = resolveChipColor(token);
  return {
    backgroundColor: `color-mix(in oklch, ${color} 14%, transparent)`,
    borderColor: `color-mix(in oklch, ${color} 40%, transparent)`,
    borderLeftColor: color,
  };
}
