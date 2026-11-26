import { useGT } from "gt-react";

import { Button } from "~/components/ui/button";
import { useClientSettings } from "~/hooks/useSettings";
import { cn } from "~/lib/utils";
import {
  chipDotClass,
  shouldShowComposerChips,
  type ComposerChipVisibilityInput,
} from "./composerChips";

export function ComposerChipDot({ color }: { color: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", chipDotClass(color))} />;
}

/** Quick-send chips under the composer input. Clicking one sends its text right away. */
export function ComposerChipRow({
  disabled,
  onPick,
  ...visibility
}: Omit<ComposerChipVisibilityInput, "chipCount"> & {
  readonly disabled: boolean;
  readonly onPick: (text: string) => void;
}) {
  const gt = useGT();
  const chips = useClientSettings((settings) => settings.aviCodeChips);
  if (!shouldShowComposerChips({ ...visibility, chipCount: chips.length })) return null;
  return (
    <div
      data-chat-composer-chips="true"
      className="flex min-w-0 flex-wrap items-center gap-1.5 px-2 pb-1.5"
    >
      {chips.map((chip) => (
        <Button
          key={chip.id}
          variant="outline"
          size="xs"
          disabled={disabled}
          title={chip.text}
          aria-label={gt("Send {label}", { label: chip.label })}
          onClick={() => onPick(chip.text)}
        >
          <ComposerChipDot color={chip.color} />
          <span className="max-w-40 truncate">{chip.label}</span>
        </Button>
      ))}
    </div>
  );
}
