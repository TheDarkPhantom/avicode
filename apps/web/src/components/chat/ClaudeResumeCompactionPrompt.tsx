import type { UserInputQuestion } from "@t3tools/contracts";
import {
  CLAUDE_RESUME_COMPACTION_COMPACT_ANSWER,
  CLAUDE_RESUME_COMPACTION_KEEP_ANSWER,
  CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
} from "@t3tools/shared/claudeCompaction";
import { Minimize2Icon } from "lucide-react";
import { Button } from "../ui/button";

/**
 * Avi Code addition (upstream #8144): Claude's native resume dialog, shown as
 * a dedicated prompt instead of the generic questionnaire. Each button answers
 * the pending request with the option label the server maps back to Claude's
 * action (`resolveClaudeResumeCompactionAction`).
 */
export function ClaudeResumeCompactionPrompt(props: {
  question: UserInputQuestion;
  isResponding: boolean;
  onAnswer: (questionId: string, optionLabel: string) => void;
}) {
  const { question, isResponding, onAnswer } = props;
  const answer = (label: string) => onAnswer(question.id, label);
  return (
    <div className="px-4 py-3 sm:px-5" data-claude-resume-compaction-prompt="true">
      <div className="flex items-start gap-2.5">
        <Minimize2Icon
          aria-hidden="true"
          className="mt-0.5 size-4 shrink-0 text-muted-foreground"
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-foreground text-sm">Resume with less context</p>
          <p className="mt-0.5 text-muted-foreground text-xs">{question.question}</p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
        <Button
          size="xs"
          variant="ghost"
          disabled={isResponding}
          onClick={() => answer(CLAUDE_RESUME_COMPACTION_NEVER_ANSWER)}
        >
          {CLAUDE_RESUME_COMPACTION_NEVER_ANSWER}
        </Button>
        <Button
          size="xs"
          variant="outline"
          disabled={isResponding}
          onClick={() => answer(CLAUDE_RESUME_COMPACTION_KEEP_ANSWER)}
        >
          {CLAUDE_RESUME_COMPACTION_KEEP_ANSWER}
        </Button>
        <Button
          size="xs"
          disabled={isResponding}
          onClick={() => answer(CLAUDE_RESUME_COMPACTION_COMPACT_ANSWER)}
        >
          {CLAUDE_RESUME_COMPACTION_COMPACT_ANSWER}
        </Button>
      </div>
    </div>
  );
}
