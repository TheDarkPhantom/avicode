import type { UserInputQuestion } from "@t3tools/contracts";

export interface PendingUserInputDraftAnswer {
  selectedOptionLabels?: string[];
  customAnswer?: string;
}

export interface PendingUserInputProgress {
  questionIndex: number;
  activeQuestion: UserInputQuestion | null;
  activeDraft: PendingUserInputDraftAnswer | undefined;
  selectedOptionLabels: string[];
  customAnswer: string;
  resolvedAnswer: string | string[] | null;
  usingCustomAnswer: boolean;
  answeredQuestionCount: number;
  isLastQuestion: boolean;
  isComplete: boolean;
  canAdvance: boolean;
}

function normalizeDraftAnswer(value: string | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeSelectedOptionLabels(value: string[] | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const normalized: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (trimmed.length > 0) {
      normalized.push(trimmed);
    }
  }

  return Array.from(new Set(normalized));
}

export function resolvePendingUserInputAnswer(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
): string | string[] | null {
  const customAnswer = normalizeDraftAnswer(draft?.customAnswer);
  if (customAnswer) {
    return customAnswer;
  }

  const selectedOptionLabels = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
  if (question.multiSelect) {
    return selectedOptionLabels.length > 0 ? selectedOptionLabels : null;
  }

  return selectedOptionLabels[0] ?? null;
}

export function setPendingUserInputCustomAnswer(
  draft: PendingUserInputDraftAnswer | undefined,
  customAnswer: string,
): PendingUserInputDraftAnswer {
  const selectedOptionLabels =
    customAnswer.trim().length > 0
      ? undefined
      : normalizeSelectedOptionLabels(draft?.selectedOptionLabels);

  return {
    customAnswer,
    ...(selectedOptionLabels && selectedOptionLabels.length > 0 ? { selectedOptionLabels } : {}),
  };
}

export function togglePendingUserInputOptionSelection(
  question: UserInputQuestion,
  draft: PendingUserInputDraftAnswer | undefined,
  optionLabel: string,
): PendingUserInputDraftAnswer {
  if (question.multiSelect) {
    const selectedOptionLabels = normalizeSelectedOptionLabels(draft?.selectedOptionLabels);
    const nextSelectedOptionLabels = selectedOptionLabels.includes(optionLabel)
      ? selectedOptionLabels.filter((label) => label !== optionLabel)
      : [...selectedOptionLabels, optionLabel];

    return {
      customAnswer: "",
      ...(nextSelectedOptionLabels.length > 0
        ? { selectedOptionLabels: nextSelectedOptionLabels }
        : {}),
    };
  }

  return {
    customAnswer: "",
    selectedOptionLabels: [optionLabel],
  };
}

export function buildPendingUserInputAnswers(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): Record<string, string | string[]> | null {
  const answers: Record<string, string | string[]> = {};

  for (const question of questions) {
    const answer = resolvePendingUserInputAnswer(question, draftAnswers[question.id]);
    if (!answer) {
      return null;
    }
    answers[question.id] = answer;
  }

  return answers;
}

/**
 * Avi Code addition: the answer a user had already chosen when their question
 * expired, rendered as composer text.
 *
 * A question dies with its provider session, and the draft answer only lives in
 * client state keyed by a request id nothing will ever accept again. Rather
 * than drop it, it becomes an ordinary message the user can send to restart the
 * turn. Returns null when nothing was drafted, so the caller can tell "no
 * answer to recover" from "an empty one".
 */
export function formatExpiredUserInputDraft(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): string | null {
  const lines: string[] = [];

  for (const question of questions) {
    const answer = resolvePendingUserInputAnswer(question, draftAnswers[question.id]);
    if (!answer) continue;
    const rendered = Array.isArray(answer) ? answer.join(", ") : answer;
    lines.push(`${question.header}: ${rendered}`);
  }

  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * Avi Code addition: drop entries for request ids that will never be answered.
 * The per-request draft maps are keyed by a request id and had no eviction, so
 * every question a thread ever asked stayed in memory for the session.
 * Returns the original object when nothing matched, so callers can pass it
 * straight to a state setter without forcing a re-render.
 */
export function omitPendingUserInputRequestIds<Value>(
  entriesByRequestId: Record<string, Value>,
  requestIds: ReadonlySet<string>,
): Record<string, Value> {
  const matching = Object.keys(entriesByRequestId).filter((key) => requestIds.has(key));
  if (matching.length === 0) {
    return entriesByRequestId;
  }
  const next = { ...entriesByRequestId };
  for (const key of matching) {
    delete next[key];
  }
  return next;
}

export function countAnsweredPendingUserInputQuestions(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  return questions.reduce((count, question) => {
    return resolvePendingUserInputAnswer(question, draftAnswers[question.id]) ? count + 1 : count;
  }, 0);
}

export function findFirstUnansweredPendingUserInputQuestionIndex(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
): number {
  const unansweredIndex = questions.findIndex(
    (question) => !resolvePendingUserInputAnswer(question, draftAnswers[question.id]),
  );

  return unansweredIndex === -1 ? Math.max(questions.length - 1, 0) : unansweredIndex;
}

/**
 * Whether an Escape keypress should leave the pending user-input questionnaire.
 *
 * Escape is the only exit from the questionnaire, so it has to be conservative:
 * a chord is somebody else's shortcut, and an already-handled event belongs to
 * whoever handled it (dictation cancels this way). `targetOutsideComposer` is
 * how an open menu, dialog, or popover keeps Escape — they trap focus, so a
 * keypress aimed anywhere but the composer or the bare document is theirs to
 * close, and closing one must not also stop the turn underneath it.
 */
export function shouldDismissPendingUserInputForKey(input: {
  key: string;
  defaultPrevented: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  targetOutsideComposer: boolean;
  isResponding: boolean;
}): boolean {
  if (input.key !== "Escape") return false;
  if (input.defaultPrevented) return false;
  if (input.metaKey || input.ctrlKey || input.altKey || input.shiftKey) return false;
  if (input.targetOutsideComposer) return false;
  return !input.isResponding;
}

export function derivePendingUserInputProgress(
  questions: ReadonlyArray<UserInputQuestion>,
  draftAnswers: Record<string, PendingUserInputDraftAnswer>,
  questionIndex: number,
): PendingUserInputProgress {
  const normalizedQuestionIndex =
    questions.length === 0 ? 0 : Math.max(0, Math.min(questionIndex, questions.length - 1));
  const activeQuestion = questions[normalizedQuestionIndex] ?? null;
  const activeDraft = activeQuestion ? draftAnswers[activeQuestion.id] : undefined;
  const resolvedAnswer = activeQuestion
    ? resolvePendingUserInputAnswer(activeQuestion, activeDraft)
    : null;
  const customAnswer = activeDraft?.customAnswer ?? "";
  const answeredQuestionCount = countAnsweredPendingUserInputQuestions(questions, draftAnswers);
  const isLastQuestion =
    questions.length === 0 ? true : normalizedQuestionIndex >= questions.length - 1;

  return {
    questionIndex: normalizedQuestionIndex,
    activeQuestion,
    activeDraft,
    selectedOptionLabels: normalizeSelectedOptionLabels(activeDraft?.selectedOptionLabels),
    customAnswer,
    resolvedAnswer,
    usingCustomAnswer: customAnswer.trim().length > 0,
    answeredQuestionCount,
    isLastQuestion,
    isComplete: buildPendingUserInputAnswers(questions, draftAnswers) !== null,
    canAdvance: Boolean(resolvedAnswer),
  };
}
