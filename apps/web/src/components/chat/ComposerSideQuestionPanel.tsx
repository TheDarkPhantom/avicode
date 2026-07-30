import { useAtomValue, useAtomSet } from "@effect/atom-react";
import { XIcon } from "lucide-react";
import { useEffect } from "react";

import {
  EMPTY_SIDE_QUESTION_STATE,
  sideQuestionStateAtom,
} from "@t3tools/client-runtime/state/sideQuestion";

import ChatMarkdown from "../ChatMarkdown";

/**
 * Avi Code addition: the `/btw` answer.
 *
 * Sits above the composer and is thrown away on dismissal — it is not part of
 * the conversation and never becomes a message. That is the point of the
 * command: ask, read, carry on, with nothing left in the thread to scroll past.
 */
export function ComposerSideQuestionPanel({
  threadKey,
  markdownCwd,
}: {
  threadKey: string;
  markdownCwd: string | undefined;
}) {
  const state = useAtomValue(sideQuestionStateAtom(threadKey));
  const setState = useAtomSet(sideQuestionStateAtom(threadKey));
  const isOpen = state.status !== "idle";

  useEffect(() => {
    if (!isOpen) return;
    const handler = (event: KeyboardEvent) => {
      // Capture phase: Lexical owns the composer's keydown handling, and
      // without this the editor swallows Escape before it reaches us.
      if (event.key !== "Escape" && event.key !== " " && event.key !== "Enter") return;
      // Space and Enter are only dismissals when focus is outside the
      // composer — otherwise typing the next message would close the panel
      // mid-word, or Enter would eat the send.
      const target = event.target;
      const typingInComposer =
        target instanceof HTMLElement &&
        (target.isContentEditable || target.closest("[data-chat-composer-form='true']") !== null);
      if (event.key !== "Escape" && typingInComposer) return;
      event.preventDefault();
      event.stopPropagation();
      setState(EMPTY_SIDE_QUESTION_STATE);
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, setState]);

  if (!isOpen) return null;

  return (
    <div className="dropdown-glass relative flex max-h-full min-h-0 flex-col rounded-[20px] p-3 text-sm">
      <div className="mb-1.5 flex items-start gap-2">
        <span className="shrink-0 font-medium text-[11px] text-amber-600 uppercase tracking-wide dark:text-amber-300/90">
          /btw
        </span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {state.question}
        </span>
        <button
          type="button"
          aria-label="Dismiss side question"
          className="-mt-0.5 shrink-0 cursor-pointer rounded-sm text-muted-foreground/60 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-ring"
          onClick={() => setState(EMPTY_SIDE_QUESTION_STATE)}
        >
          <XIcon className="size-3.5" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {state.status === "failed" ? (
          <p className="text-destructive text-xs">{state.error}</p>
        ) : state.answer.length === 0 ? (
          <p className="text-muted-foreground text-xs">Thinking…</p>
        ) : (
          <ChatMarkdown
            text={state.answer}
            cwd={markdownCwd}
            isStreaming={state.status === "asking"}
            className="chat-markdown text-sm"
          />
        )}
      </div>

      <p className="mt-2 shrink-0 text-[10px] text-muted-foreground/60">
        Not saved to this chat. Esc to dismiss.
      </p>
    </div>
  );
}
