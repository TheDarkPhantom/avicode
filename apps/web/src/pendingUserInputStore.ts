import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  initialPendingUserInputState,
  pendingUserInputReducer,
  type PendingUserInputAction,
  type PendingUserInputDraftAnswer,
  type PendingUserInputState,
  type PendingUserInputSubmissionIntent,
} from "./pendingUserInput";
import { createDebouncedStorage, createMemoryStorage } from "./lib/storage";

export const PENDING_USER_INPUT_DRAFT_STORAGE_KEY = "t3code:pending-user-input-drafts:v1";
const PENDING_USER_INPUT_DRAFT_STORAGE_VERSION = 1;
const PENDING_USER_INPUT_PERSIST_DEBOUNCE_MS = 300;

interface PendingUserInputStoreState {
  statesByThreadKey: Record<string, PendingUserInputState>;
  dispatch: (
    threadKey: string,
    action: PendingUserInputAction,
  ) => PendingUserInputSubmissionIntent | null;
  clearRequests: (threadKey: string, requestIds: ReadonlySet<string>) => void;
  clearThread: (threadKey: string) => void;
}

interface PersistedPendingUserInputState {
  answersByRequestId: PendingUserInputState["answersByRequestId"];
  questionIndexByRequestId: PendingUserInputState["questionIndexByRequestId"];
  nextSubmissionId: number;
}

interface PersistedPendingUserInputStoreState {
  statesByThreadKey: Record<string, PersistedPendingUserInputState>;
}

const pendingUserInputDebouncedStorage = createDebouncedStorage(
  typeof localStorage !== "undefined" ? localStorage : createMemoryStorage(),
  PENDING_USER_INPUT_PERSIST_DEBOUNCE_MS,
);

if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
  window.addEventListener("beforeunload", () => {
    pendingUserInputDebouncedStorage.flush();
  });
}

function hasDraftAnswer(answer: PendingUserInputDraftAnswer): boolean {
  return (answer.customAnswer?.length ?? 0) > 0 || (answer.selectedOptionLabels?.length ?? 0) > 0;
}

function hasPendingUserInputDraft(state: PendingUserInputState): boolean {
  return (
    Object.values(state.answersByRequestId).some((answers) =>
      Object.values(answers).some(hasDraftAnswer),
    ) || Object.values(state.questionIndexByRequestId).some((index) => index > 0)
  );
}

function consumeSubmissionIntent(state: PendingUserInputState): {
  state: PendingUserInputState;
  intent: PendingUserInputSubmissionIntent | null;
} {
  const intent = state.submissionIntent;
  return {
    state: intent ? { ...state, submissionIntent: null } : state,
    intent,
  };
}

function normalizeDraftAnswer(value: unknown): PendingUserInputDraftAnswer | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const customAnswer = typeof record.customAnswer === "string" ? record.customAnswer : undefined;
  const selectedOptionLabels = Array.isArray(record.selectedOptionLabels)
    ? record.selectedOptionLabels.filter((entry): entry is string => typeof entry === "string")
    : undefined;
  if (customAnswer === undefined && selectedOptionLabels === undefined) return null;
  return {
    ...(customAnswer !== undefined ? { customAnswer } : {}),
    ...(selectedOptionLabels !== undefined ? { selectedOptionLabels } : {}),
  };
}

function normalizeAnswersByRequestId(value: unknown): PendingUserInputState["answersByRequestId"] {
  if (!value || typeof value !== "object") return {};
  const normalized: PendingUserInputState["answersByRequestId"] = {};
  for (const [requestId, requestAnswers] of Object.entries(value)) {
    if (!requestAnswers || typeof requestAnswers !== "object") continue;
    const answers: Record<string, PendingUserInputDraftAnswer> = {};
    for (const [questionId, answer] of Object.entries(requestAnswers)) {
      const normalizedAnswer = normalizeDraftAnswer(answer);
      if (normalizedAnswer) answers[questionId] = normalizedAnswer;
    }
    if (Object.keys(answers).length > 0) normalized[requestId] = answers;
  }
  return normalized;
}

function normalizeQuestionIndexByRequestId(
  value: unknown,
): PendingUserInputState["questionIndexByRequestId"] {
  if (!value || typeof value !== "object") return {};
  const normalized: PendingUserInputState["questionIndexByRequestId"] = {};
  for (const [requestId, index] of Object.entries(value)) {
    if (typeof index !== "number" || !Number.isFinite(index)) continue;
    normalized[requestId] = Math.max(0, Math.floor(index));
  }
  return normalized;
}

export function normalizePendingUserInputStoreState(
  value: unknown,
): Pick<PendingUserInputStoreState, "statesByThreadKey"> {
  const statesByThreadKey: Record<string, PendingUserInputState> = {};
  if (!value || typeof value !== "object") return { statesByThreadKey };
  const rawStates = (value as { statesByThreadKey?: unknown }).statesByThreadKey;
  if (!rawStates || typeof rawStates !== "object") return { statesByThreadKey };

  for (const [threadKey, rawState] of Object.entries(rawStates)) {
    if (!threadKey || !rawState || typeof rawState !== "object") continue;
    const record = rawState as Record<string, unknown>;
    const nextSubmissionId =
      typeof record.nextSubmissionId === "number" &&
      Number.isFinite(record.nextSubmissionId) &&
      record.nextSubmissionId >= 1
        ? Math.floor(record.nextSubmissionId)
        : 1;
    const state: PendingUserInputState = {
      answersByRequestId: normalizeAnswersByRequestId(record.answersByRequestId),
      questionIndexByRequestId: normalizeQuestionIndexByRequestId(record.questionIndexByRequestId),
      submissionIntent: null,
      nextSubmissionId,
    };
    if (hasPendingUserInputDraft(state)) statesByThreadKey[threadKey] = state;
  }
  return { statesByThreadKey };
}

export function partializePendingUserInputStoreState(
  state: PendingUserInputStoreState,
): PersistedPendingUserInputStoreState {
  const normalized = normalizePendingUserInputStoreState({
    statesByThreadKey: state.statesByThreadKey,
  });
  return {
    statesByThreadKey: Object.fromEntries(
      Object.entries(normalized.statesByThreadKey).map(([threadKey, draft]) => [
        threadKey,
        {
          answersByRequestId: draft.answersByRequestId,
          questionIndexByRequestId: draft.questionIndexByRequestId,
          nextSubmissionId: draft.nextSubmissionId,
        },
      ]),
    ),
  };
}

export const usePendingUserInputStore = create<PendingUserInputStoreState>()(
  persist(
    (set, get) => ({
      statesByThreadKey: {},
      dispatch: (threadKey, action) => {
        if (!threadKey) return null;
        let submissionIntent: PendingUserInputSubmissionIntent | null = null;
        set((store) => {
          const current = store.statesByThreadKey[threadKey] ?? initialPendingUserInputState;
          const reduced = pendingUserInputReducer(current, action);
          const consumed = consumeSubmissionIntent(reduced);
          submissionIntent = consumed.intent;
          const statesByThreadKey = { ...store.statesByThreadKey };
          if (hasPendingUserInputDraft(consumed.state)) {
            statesByThreadKey[threadKey] = consumed.state;
          } else {
            delete statesByThreadKey[threadKey];
          }
          return { statesByThreadKey };
        });
        return submissionIntent;
      },
      clearRequests: (threadKey, requestIds) => {
        if (!threadKey || requestIds.size === 0) return;
        get().dispatch(threadKey, { type: "requests-cleared", requestIds });
      },
      clearThread: (threadKey) => {
        if (!threadKey) return;
        set((store) => {
          if (!store.statesByThreadKey[threadKey]) return store;
          const statesByThreadKey = { ...store.statesByThreadKey };
          delete statesByThreadKey[threadKey];
          return { statesByThreadKey };
        });
      },
    }),
    {
      name: PENDING_USER_INPUT_DRAFT_STORAGE_KEY,
      version: PENDING_USER_INPUT_DRAFT_STORAGE_VERSION,
      storage: createJSONStorage(() => pendingUserInputDebouncedStorage),
      partialize: partializePendingUserInputStoreState,
      merge: (persistedState, currentState) => ({
        ...currentState,
        ...normalizePendingUserInputStoreState(persistedState),
      }),
    },
  ),
);

export function selectPendingUserInputState(
  state: PendingUserInputStoreState,
  threadKey: string,
): PendingUserInputState {
  return state.statesByThreadKey[threadKey] ?? initialPendingUserInputState;
}

export function flushPendingUserInputDrafts(): void {
  pendingUserInputDebouncedStorage.flush();
}

export function resetPendingUserInputStoreForTest(): void {
  usePendingUserInputStore.setState({ statesByThreadKey: {} });
}
