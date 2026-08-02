import { ChevronDownIcon, ChevronUpIcon, SearchIcon, XIcon } from "lucide-react";
import { useEffect, useRef } from "react";

import { Button } from "~/components/ui/button";
import { InputGroup, InputGroupInput } from "~/components/ui/input-group";
import { cn } from "~/lib/utils";

/**
 * Avi Code addition: find within the open thread.
 *
 * Deliberately non-modal, so the transcript stays scrollable and selectable
 * while the bar is open. That rules out the dialog primitive, which would trap
 * focus, so Escape is handled here on the capture phase for the same reason the
 * side-question panel does it: Lexical owns the composer's keydown handling and
 * would otherwise swallow the key first.
 */
export interface ThreadFindBarProps {
  readonly query: string;
  readonly matchCount: number;
  readonly matchIndex: number;
  readonly statusLabel: string;
  readonly onQueryChange: (query: string) => void;
  readonly onStep: (direction: "next" | "previous") => void;
  readonly onClose: () => void;
}

export function ThreadFindBar({
  query,
  matchCount,
  statusLabel,
  onQueryChange,
  onStep,
  onClose,
}: ThreadFindBarProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [onClose]);

  const hasQuery = query.trim().length > 0;
  const canStep = matchCount > 0;

  return (
    <div
      // `pointer-events-none` on the wrapper keeps the transcript underneath
      // usable; only the bar itself takes the pointer.
      className="pointer-events-none absolute inset-x-0 top-2 z-30 flex justify-center px-3"
      data-thread-find-bar="true"
    >
      <div className="dropdown-glass pointer-events-auto flex items-center gap-1 rounded-full py-1 ps-2 pe-1 shadow-sm">
        <InputGroup variant="ghost" className="w-56">
          <SearchIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
          <InputGroupInput
            ref={inputRef}
            type="search"
            size="sm"
            value={query}
            placeholder="Find in thread"
            aria-label="Find in thread"
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              onStep(event.shiftKey ? "previous" : "next");
            }}
          />
        </InputGroup>
        <span
          className={cn(
            "min-w-16 shrink-0 text-center text-xs tabular-nums",
            hasQuery && matchCount === 0 ? "text-destructive" : "text-muted-foreground",
          )}
          aria-live="polite"
        >
          {statusLabel}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Previous match"
          disabled={!canStep}
          onClick={() => onStep("previous")}
        >
          <ChevronUpIcon className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Next match"
          disabled={!canStep}
          onClick={() => onStep("next")}
        >
          <ChevronDownIcon className="size-3.5" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label="Close find"
          onClick={onClose}
        >
          <XIcon className="size-3.5" aria-hidden />
        </Button>
      </div>
    </div>
  );
}
