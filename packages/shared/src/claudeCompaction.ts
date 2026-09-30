/**
 * Copy for Claude's resume compaction dialog, shared by the server adapter
 * (which asks the question) and the web client (which recognizes the
 * question and its "never" answer in resolved user-input activities to
 * mirror the dismissal). Both sides must agree on these strings, so they
 * live here: reword the question or the answer labels in this file only.
 */
export const CLAUDE_RESUME_COMPACTION_HEADER = "Resume session";
export const CLAUDE_RESUME_COMPACTION_COMPACT_ANSWER = "Compact and continue";
export const CLAUDE_RESUME_COMPACTION_KEEP_ANSWER = "Keep full history";
export const CLAUDE_RESUME_COMPACTION_NEVER_ANSWER = "Don't ask again";

export function formatClaudeResumeCompactionQuestion(input: {
  readonly ageMinutes: number;
  readonly estimatedTokens: number;
}): string {
  const ageLabel =
    input.ageMinutes >= 60
      ? `${Math.floor(input.ageMinutes / 60)}h ${input.ageMinutes % 60}m`
      : `${input.ageMinutes}m`;
  return `This session is ${ageLabel} old and uses ${input.estimatedTokens.toLocaleString("en-US")} tokens. Compact it before continuing?`;
}

const CLAUDE_RESUME_COMPACTION_QUESTION_PATTERN =
  /^This session is (?:\d+h \d+m|\d+m) old and uses \d{1,3}(?:,\d{3})* tokens\. Compact it before continuing\?$/u;

export function isClaudeResumeCompactionQuestion(question: string): boolean {
  return CLAUDE_RESUME_COMPACTION_QUESTION_PATTERN.test(question);
}

/** What Claude's `resume_return` dialog should do with the user's answer. */
export function resolveClaudeResumeCompactionAction(
  answer: unknown,
): "compact" | "continue" | "never" {
  if (answer === CLAUDE_RESUME_COMPACTION_COMPACT_ANSWER) return "compact";
  if (answer === CLAUDE_RESUME_COMPACTION_NEVER_ANSWER) return "never";
  return "continue";
}
