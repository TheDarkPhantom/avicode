import { memo, type PointerEventHandler } from "react";
import { MicIcon, SquareIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import type { DictationStatus } from "~/voice/useDictation";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ComposerControl, ComposerControlIcon } from "./ComposerControl";

interface ComposerDictateButtonProps {
  readonly status: DictationStatus;
  readonly isActive: boolean;
  /** Renders the wider labelled form used while the composer is empty. */
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly onToggle: () => void;
  readonly preserveComposerFocusOnPointerDown?: boolean;
}

const preventPointerFocus: PointerEventHandler<HTMLElement> = (event) => {
  event.preventDefault();
};

export function dictateButtonLabel(input: {
  readonly status: DictationStatus;
  readonly hasKey: boolean;
}): string {
  if (!input.hasKey) return "Add a Deepgram API key in Settings to dictate";
  switch (input.status) {
    case "starting":
      return "Starting dictation…";
    case "recording":
      return "Stop dictating (Esc to discard)";
    case "stopping":
      return "Finishing up…";
    case "idle":
      return "Dictate a message";
  }
}

export const ComposerDictateButton = memo(function ComposerDictateButton({
  status,
  isActive,
  expanded = false,
  disabled = false,
  onToggle,
  preserveComposerFocusOnPointerDown = false,
}: ComposerDictateButtonProps) {
  const label = dictateButtonLabel({ status, hasKey: !disabled });
  const pointerFocusProps = preserveComposerFocusOnPointerDown
    ? { onPointerDown: preventPointerFocus }
    : undefined;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <ComposerControl
            type="button"
            className={cn(
              "shrink-0 whitespace-nowrap",
              isActive
                ? "bg-destructive/10 text-destructive hover:bg-destructive/15 hover:text-destructive"
                : undefined,
            )}
            disabled={disabled}
            onClick={onToggle}
            aria-label={label}
            aria-pressed={isActive}
            data-composer-dictate-active={isActive ? "true" : undefined}
            {...pointerFocusProps}
          />
        }
      >
        {/* Avi Code addition: no pulse while recording. It ran on a fixed CSS
            timer regardless of the microphone, so it reported liveness a muted
            input did not have, and it repainted for the whole session. The
            level meter beside this button carries that signal from the real
            audio instead. */}
        <ComposerControlIcon
          icon={isActive ? SquareIcon : MicIcon}
          className={cn(isActive ? "text-current opacity-100" : undefined)}
        />
        {expanded ? (
          <span>{isActive ? "Stop" : "Dictate"}</span>
        ) : (
          <span className="sr-only">{label}</span>
        )}
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  );
});
