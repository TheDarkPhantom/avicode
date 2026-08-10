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

export interface PendingUserInputSubmissionIntent {
  requestId: string;
  submissionId: number;
  answers: Record<string, string | string[]>;
}

export interface PendingUserInputState {
  answersByRequestId: Record<string, Record<string, PendingUserInputDraftAnswer>>;
  questionIndexByRequestId: Record<string, number>;
  submissionIntent: PendingUserInputSubmissionIntent | null;
  nextSubmissionId: number;
}

export const initialPendingUserInputState: PendingUserInputState = {
  answersByRequestId: {},
  questionIndexByRequestId: {},
  submissionIntent: null,
  nextSubmissionId: 1,
};

export type PendingUserInputAction =
  | {
      type: "option-selected";
      requestId: string;
      questions: ReadonlyArray<UserInputQuestion>;
      questionId: string;
      optionLabel: string;
    }
  | {
      type: "custom-answer-changed";
      requestId: string;
      questionId: string;
      value: string;
    }
  | {
      type: "advance";
      requestId: string;
      questions: ReadonlyArray<UserInputQuestion>;
    }
  | { type: "previous"; requestId: string }
  | { type: "submission-consumed"; submissionId: number }
  | { type: "requests-cleared"; requestIds: ReadonlySet<string> };

/** Atomic interaction state for the composer questionnaire. */
export function pendingUserInputReducer(
  state: PendingUserInputState,
  action: PendingUserInputAction,
): PendingUserInputState {
  if (action.type === "submission-consumed") {
    return state.submissionIntent?.submissionId === action.submissionId
      ? { ...state, submissionIntent: null }
      : state;
  }

  if (action.type === "requests-cleared") {
    const answersByRequestId = omitPendingUserInputRequestIds(
      state.answersByRequestId,
      action.requestIds,
    );
    const questionIndexByRequestId = omitPendingUserInputRequestIds(
      state.questionIndexByRequestId,
      action.requestIds,
    );
    const submissionIntent =
      state.submissionIntent && action.requestIds.has(state.submissionIntent.requestId)
        ? null
        : state.submissionIntent;
    if (
      answersByRequestId === state.answersByRequestId &&
      questionIndexByRequestId === state.questionIndexByRequestId &&
      submissionIntent === state.submissionIntent
    ) {
      return state;
    }
    return { ...state, answersByRequestId, questionIndexByRequestId, submissionIntent };
  }

  const requestAnswers = state.answersByRequestId[action.requestId] ?? {};
  const questionIndex = state.questionIndexByRequestId[action.requestId] ?? 0;

  if (action.type === "custom-answer-changed") {
    return {
      ...state,
      answersByRequestId: {
        ...state.answersByRequestId,
        [action.requestId]: {
          ...requestAnswers,
          [action.questionId]: setPendingUserInputCustomAnswer(
            requestAnswers[action.questionId],
            action.value,
          ),
        },
      },
    };
  }

  if (action.type === "previous") {
    return {
      ...state,
      questionIndexByRequestId: {
        ...state.questionIndexByRequestId,
        [action.requestId]: Math.max(questionIndex - 1, 0),
      },
    };
  }

  if (action.type === "option-selected") {
    const selectedQuestionIndex = action.questions.findIndex(
      (question) => question.id === action.questionId,
    );
    const question = action.questions[selectedQuestionIndex];
    if (!question) return state;

    const nextRequestAnswers = {
      ...requestAnswers,
      [action.questionId]: togglePendingUserInputOptionSelection(
        question,
        requestAnswers[action.questionId],
        action.optionLabel,
      ),
    };
    const isLastQuestion = selectedQuestionIndex >= action.questions.length - 1;
    const resolvedAnswers =
      !question.multiSelect && isLastQuestion
        ? buildPendingUserInputAnswers(action.questions, nextRequestAnswers)
        : null;

    return {
      ...state,
      answersByRequestId: {
        ...state.answersByRequestId,
        [action.requestId]: nextRequestAnswers,
      },
      questionIndexByRequestId: question.multiSelect
        ? state.questionIndexByRequestId
        : {
            ...state.questionIndexByRequestId,
            [action.requestId]: isLastQuestion ? selectedQuestionIndex : selectedQuestionIndex + 1,
          },
      submissionIntent: resolvedAnswers
        ? {
            requestId: action.requestId,
            submissionId: state.nextSubmissionId,
            answers: resolvedAnswers,
          }
        : state.submissionIntent,
      nextSubmissionId: resolvedAnswers ? state.nextSubmissionId + 1 : state.nextSubmissionId,
    };
  }

  const normalizedIndex =
    action.questions.length === 0
      ? 0
      : Math.max(0, Math.min(questionIndex, action.questions.length - 1));
  const isLastQuestion = normalizedIndex >= action.questions.length - 1;
  if (!isLastQuestion) {
    const activeQuestion = action.questions[normalizedIndex];
    if (
      !activeQuestion ||
      !resolvePendingUserInputAnswer(activeQuestion, requestAnswers[activeQuestion.id])
    ) {
      return state;
    }
    return {
      ...state,
      questionIndexByRequestId: {
        ...state.questionIndexByRequestId,
        [action.requestId]: normalizedIndex + 1,
      },
    };
  }

  const resolvedAnswers = buildPendingUserInputAnswers(action.questions, requestAnswers);
  if (!resolvedAnswers) return state;
  return {
    ...state,
    submissionIntent: {
      requestId: action.requestId,
      submissionId: state.nextSubmissionId,
      answers: resolvedAnswers,
    },
    nextSubmissionId: state.nextSubmissionId + 1,
  };
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

/** Format answers persisted with an expired response after client state is gone. */
export function formatExpiredUserInputAnswers(
  questions: ReadonlyArray<UserInputQuestion>,
  answers: Readonly<Record<string, string | string[]>>,
): string | null {
  const lines = questions.flatMap((question) => {
    const answer = answers[question.id];
    if (typeof answer === "string" && answer.trim().length > 0) {
      return [`${question.header}: ${answer}`];
    }
    if (Array.isArray(answer) && answer.length > 0) {
      return [`${question.header}: ${answer.join(", ")}`];
    }
    return [];
  });
  return lines.length > 0 ? lines.join("\n") : null;
}

/** Append a recovered answer without replacing a draft already in progress. */
export function mergeExpiredUserInputWithComposerDraft(
  existingPrompt: string,
  recoveredPrompt: string,
): string {
  return existingPrompt.trim().length > 0
    ? `${existingPrompt}\n\n${recoveredPrompt}`
    : recoveredPrompt;
}

const EXPIRED_USER_INPUT_RECOVERY_STORAGE_KEY = "t3code:expired-user-input-recovery:v1";
const MAX_REMEMBERED_EXPIRED_USER_INPUTS = 200;

function readRecoveredExpiredUserInputIds(storage: Pick<Storage, "getItem">): string[] {
  try {
    const parsed: unknown = JSON.parse(
      storage.getItem(EXPIRED_USER_INPUT_RECOVERY_STORAGE_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed.filter((value): value is string => typeof value === "string")
      : [];
  } catch {
    return [];
  }
}

/** Whether this browser already restored or deliberately dismissed the answer. */
export function hasHandledExpiredUserInputRecovery(
  storage: Pick<Storage, "getItem">,
  requestId: string,
): boolean {
  return readRecoveredExpiredUserInputIds(storage).includes(requestId);
}

/** Prevent a durable expiry activity from restoring the same answer on every reload. */
export function markExpiredUserInputRecoveryHandled(
  storage: Pick<Storage, "getItem" | "setItem">,
  requestId: string,
): void {
  const ids = readRecoveredExpiredUserInputIds(storage).filter((id) => id !== requestId);
  ids.push(requestId);
  storage.setItem(
    EXPIRED_USER_INPUT_RECOVERY_STORAGE_KEY,
    JSON.stringify(ids.slice(-MAX_REMEMBERED_EXPIRED_USER_INPUTS)),
  );
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
 * Escape is an exit from the questionnaire, so it has to be conservative:
 * a chord is somebody else's shortcut, and an already-handled event belongs to
 * whoever handled it (dictation cancels this way). `targetOutsideComposer` is
 * how an open menu, dialog, or popover keeps Escape — they trap focus, so a
 * keypress aimed anywhere but the composer or the bare document is theirs to
 * close, and closing one must not also stop the turn underneath it. Submission
 * does not suppress Escape because this is also the recovery path for a request
 * that never settles.
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
  // Dismiss is the escape hatch when submission itself stalls. Answer controls
  // remain inert while responding, but stopping the turn must always work.
  return true;
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
