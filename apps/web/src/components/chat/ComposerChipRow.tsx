import { memo } from "react";
import type { AviCodeChip } from "@t3tools/contracts";

import { cn } from "~/lib/utils";
import { chipTintStyle } from "./composerChips";

/**
 * Avi Code addition: quick-send chips shown inside the composer while the input
 * is empty. Clicking a chip sends its saved text as a message. Rendering and
 * the empty-input gate live in `ChatComposer`; this component is presentation
 * plus the click-to-send callback only.
 */
export const ComposerChipRow = memo(function ComposerChipRow({
  chips,
  onPick,
  disabled = false,
}: {
  chips: ReadonlyArray<AviCodeChip>;
  onPick: (text: string) => void;
  disabled?: boolean;
}) {
  if (chips.length === 0) return null;
  return (
    <div
      data-chat-composer-chips="true"
      className="flex flex-wrap items-center gap-1.5 px-2.5 pb-1.5 sm:px-3"
    >
      {chips.map((chip) => (
        <button
          key={chip.id}
          type="button"
          disabled={disabled}
          title={chip.text}
          aria-label={`Send: ${chip.label}`}
          style={chipTintStyle(chip.color)}
          onClick={() => onPick(chip.text)}
          className={cn(
            "inline-flex max-w-full items-center rounded-md border border-l-2 px-2 py-0.5",
            "text-[12px] font-medium text-foreground/80 select-none",
            "transition-colors hover:text-foreground",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          <span className="truncate">{chip.label}</span>
        </button>
      ))}
    </div>
  );
});
