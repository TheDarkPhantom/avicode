import { memo, useEffect, useEffectEvent } from "react";
import { type PendingUserInput } from "../../session-logic";
import {
  derivePendingUserInputProgress,
  shouldDismissPendingUserInputForKey,
  type PendingUserInputDraftAnswer,
} from "../../pendingUserInput";
import { CheckIcon } from "lucide-react";
import { cn } from "~/lib/utils";

const COMPOSER_FORM_SELECTOR = "[data-chat-composer-form='true']";

// Escape belongs to whatever holds focus. The composer and the bare document
// are the questionnaire's; anything else — a menu, a popover, a dialog, a
// sidebar field — is somebody else's and gets to close itself first.
function isEscapeTargetOutsideComposer(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target === document.body || target === document.documentElement) return false;
  return target.closest(COMPOSER_FORM_SELECTOR) === null;
}

interface PendingUserInputPanelProps {
  pendingUserInputs: PendingUserInput[];
  // Whether the active prompt's answer is in flight. Callers pass the
  // user-input responding state, not the approval one — the two are separate
  // sets and mixing them leaves the questionnaire live during a submit.
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onDismiss: () => void;
}

export const ComposerPendingUserInputPanel = memo(function ComposerPendingUserInputPanel({
  pendingUserInputs,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onDismiss,
}: PendingUserInputPanelProps) {
  if (pendingUserInputs.length === 0) return null;
  const activePrompt = pendingUserInputs[0];
  if (!activePrompt) return null;

  return (
    <ComposerPendingUserInputCard
      key={activePrompt.requestId}
      prompt={activePrompt}
      isResponding={isResponding}
      answers={answers}
      questionIndex={questionIndex}
      onToggleOption={onToggleOption}
      onDismiss={onDismiss}
    />
  );
});

const ComposerPendingUserInputCard = memo(function ComposerPendingUserInputCard({
  prompt,
  isResponding,
  answers,
  questionIndex,
  onToggleOption,
  onDismiss,
}: {
  prompt: PendingUserInput;
  isResponding: boolean;
  answers: Record<string, PendingUserInputDraftAnswer>;
  questionIndex: number;
  onToggleOption: (questionId: string, optionLabel: string) => void;
  onDismiss: () => void;
}) {
  const progress = derivePendingUserInputProgress(prompt.questions, answers, questionIndex);
  const activeQuestion = progress.activeQuestion;

  // Avi Code addition: no auto-advance timer. Both single-select and
  // multi-select questions wait for explicit submission (Enter or the
  // "Submit answer" button) so the user can reconsider, switch options,
  // or type a custom answer before committing.
  const handleOptionSelection = useEffectEvent((questionId: string, optionLabel: string) => {
    onToggleOption(questionId, optionLabel);
  });

  // Keyboard shortcut: number keys 1-9 select corresponding options when focus is
  // outside editable fields.
  useEffect(() => {
    if (!activeQuestion || isResponding) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return;
      }
      if (
        target instanceof HTMLElement &&
        target.closest('[contenteditable]:not([contenteditable="false"])')
      ) {
        return;
      }
      const digit = Number.parseInt(event.key, 10);
      if (Number.isNaN(digit) || digit < 1 || digit > 9) return;
      const optionIndex = digit - 1;
      if (optionIndex >= activeQuestion.options.length) return;
      const option = activeQuestion.options[optionIndex];
      if (!option) return;
      event.preventDefault();
      handleOptionSelection(activeQuestion.id, option.label);
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [activeQuestion, isResponding]);

  const dismiss = useEffectEvent(() => {
    onDismiss();
  });

  // Escape leaves the questionnaire. The provider blocks its turn inside the
  // AskUserQuestion call until the request resolves, so there is no local-only
  // dismissal to offer: `onDismiss` interrupts the turn, which aborts the
  // request server side and hands the composer back with attachments, mentions,
  // and the ordinary send path restored.
  useEffect(() => {
    if (!activeQuestion) return;
    const handler = (event: globalThis.KeyboardEvent) => {
      if (
        !shouldDismissPendingUserInputForKey({
          key: event.key,
          defaultPrevented: event.defaultPrevented,
          metaKey: event.metaKey,
          ctrlKey: event.ctrlKey,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          targetOutsideComposer: isEscapeTargetOutsideComposer(event.target),
          isResponding,
        })
      ) {
        return;
      }
      event.preventDefault();
      dismiss();
    };
    // Capture phase: Lexical owns the composer's keydown handling, and without
    // this the editor swallows Escape before it reaches us.
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [activeQuestion, isResponding]);

  if (!activeQuestion) {
    return null;
  }

  const customAnswerActive = progress.customAnswer.trim().length > 0;

  return (
    <div className="px-4 py-3 sm:px-5">
      <div className="mb-2 flex items-center gap-3">
        <span className="text-[11px] font-semibold tracking-widest text-muted-foreground/55 uppercase">
          {activeQuestion.header}
        </span>
        {prompt.questions.length > 1 ? (
          <span className="flex h-5 items-center rounded-md bg-muted/60 px-1.5 text-[10px] font-medium tabular-nums text-muted-foreground/60">
            {questionIndex + 1}/{prompt.questions.length}
          </span>
        ) : null}
        {/* Touch has no Escape key, so the exit needs a control of its own. */}
        <button
          type="button"
          onClick={onDismiss}
          title="Stop the turn and go back to the normal composer"
          className="ml-auto flex h-5 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-1.5 text-[11px] font-medium text-muted-foreground/55 transition-colors duration-150 hover:bg-muted/55 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-primary/25"
        >
          <kbd className="hidden h-4 items-center rounded border border-border/50 bg-background/35 px-1 text-[10px] font-medium sm:flex">
            Esc
          </kbd>
          Dismiss
        </button>
      </div>
      <p className="text-sm text-foreground/90">{activeQuestion.question}</p>
      {activeQuestion.multiSelect ? (
        <p className="mt-1 text-xs text-muted-foreground/65">Select one or more options.</p>
      ) : null}
      <div className="mt-3 space-y-1.5">
        {activeQuestion.options.map((option, index) => {
          const isSelected =
            !customAnswerActive && progress.selectedOptionLabels.includes(option.label);
          const shortcutKey = index < 9 ? index + 1 : null;
          const className = cn(
            "group flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left outline-none transition-all duration-150 focus-visible:border-primary/40 focus-visible:ring-1 focus-visible:ring-primary/25",
            isSelected
              ? "border-primary/30 bg-primary/8 text-foreground"
              : "border-transparent bg-muted/22 text-foreground/85 hover:border-border/45 hover:bg-muted/34",
            isResponding && "opacity-50 cursor-not-allowed",
            !isResponding && "cursor-pointer",
          );
          const content = (
            <>
              <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                <span className="text-sm font-medium">{option.label}</span>
                {option.description && option.description !== option.label ? (
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                ) : null}
              </div>
              {isSelected ? (
                <CheckIcon className="size-3.5 shrink-0 text-primary" />
              ) : shortcutKey !== null ? (
                <kbd
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded border border-border/50 text-[11px] font-medium tabular-nums transition-colors duration-150",
                    "bg-background/35 text-muted-foreground/70 group-hover:border-border/70 group-hover:text-muted-foreground",
                  )}
                >
                  {shortcutKey}
                </kbd>
              ) : null}
            </>
          );
          return (
            <button
              key={`${activeQuestion.id}:${option.label}`}
              type="button"
              disabled={isResponding}
              onClick={() => {
                handleOptionSelection(activeQuestion.id, option.label);
              }}
              className={className}
            >
              {content}
            </button>
          );
        })}
      </div>
    </div>
  );
});
