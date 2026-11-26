import type { AviCodeChip } from "@t3tools/contracts/settings";

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

// Full class names, so Tailwind's source scan generates each one.
const CHIP_DOT_CLASSES: Record<ChipColorToken, string> = {
  blue: "bg-blue-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  rose: "bg-rose-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
};

export function isChipColorToken(token: string): token is ChipColorToken {
  return (CHIP_COLOR_TOKENS as ReadonlyArray<string>).includes(token);
}

/** Unknown tokens, from a hand-edited or older settings file, fall back to the default colour. */
export function chipDotClass(token: string): string {
  return CHIP_DOT_CLASSES[isChipColorToken(token) ? token : DEFAULT_CHIP_COLOR];
}

export interface ComposerChipVisibilityInput {
  readonly chipCount: number;
  readonly prompt: string;
  readonly hasPendingApproval: boolean;
  readonly pendingUserInputCount: number;
  readonly projectSelectionRequired: boolean;
  readonly noProviderAvailable: boolean;
}

/** Chips show only on an empty composer that could send, so they never sit over typing. */
export function shouldShowComposerChips(input: ComposerChipVisibilityInput): boolean {
  return (
    input.chipCount > 0 &&
    input.prompt.trim().length === 0 &&
    !input.hasPendingApproval &&
    input.pendingUserInputCount === 0 &&
    !input.projectSelectionRequired &&
    !input.noProviderAvailable
  );
}

/** A stable id from the label, suffixed when another chip already has it. */
export function nextChipId(label: string, takenIds: ReadonlyArray<string>): string {
  const slug = label
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = slug.length > 0 ? slug : "chip";
  const taken = new Set(takenIds);
  let id = base;
  for (let suffix = 2; taken.has(id); suffix += 1) {
    id = `${base}-${suffix}`;
  }
  return id;
}

export function sameChips(
  left: ReadonlyArray<AviCodeChip>,
  right: ReadonlyArray<AviCodeChip>,
): boolean {
  return (
    left.length === right.length &&
    left.every((chip, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        chip.id === other.id &&
        chip.label === other.label &&
        chip.color === other.color &&
        chip.text === other.text
      );
    })
  );
}
