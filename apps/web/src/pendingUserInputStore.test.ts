import type { UserInputQuestion } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { formatExpiredUserInputDraft } from "./pendingUserInput";
import {
  normalizePendingUserInputStoreState,
  partializePendingUserInputStoreState,
  resetPendingUserInputStoreForTest,
  selectPendingUserInputState,
  usePendingUserInputStore,
} from "./pendingUserInputStore";

const questions: ReadonlyArray<UserInputQuestion> = [
  {
    id: "scope",
    header: "Scope",
    question: "Which scope?",
    options: [{ label: "Whole app", description: "Cover the whole app" }],
    multiSelect: false,
  },
  {
    id: "detail",
    header: "Detail",
    question: "What detail matters?",
    options: [{ label: "Short", description: "Use a short answer" }],
    multiSelect: false,
  },
  {
    id: "tests",
    header: "Tests",
    question: "Which tests?",
    options: [{ label: "Focused", description: "Run focused tests" }],
    multiSelect: false,
  },
  {
    id: "ship",
    header: "Ship",
    question: "Ship now?",
    options: [{ label: "Yes", description: "Ship after checks" }],
    multiSelect: false,
  },
];

const threadA = "environment-1:thread-a";
const threadB = "environment-1:thread-b";
const requestId = "request-shared";

function stateFor(threadKey: string) {
  return selectPendingUserInputState(usePendingUserInputStore.getState(), threadKey);
}

function selectOption(threadKey: string, questionId: string, optionLabel: string) {
  return usePendingUserInputStore.getState().dispatch(threadKey, {
    type: "option-selected",
    requestId,
    questions,
    questionId,
    optionLabel,
  });
}

function setCustomAnswer(threadKey: string, questionId: string, value: string) {
  return usePendingUserInputStore.getState().dispatch(threadKey, {
    type: "custom-answer-changed",
    requestId,
    questionId,
    value,
  });
}

function advance(threadKey: string) {
  return usePendingUserInputStore.getState().dispatch(threadKey, {
    type: "advance",
    requestId,
    questions,
  });
}

beforeEach(() => {
  resetPendingUserInputStoreForTest();
});

describe("pendingUserInputStore", () => {
  it("keeps the active step and exact long answer through thread switches", () => {
    const longAnswer = `Keep every word.\n\n${"Large answer text. ".repeat(200)}`;
    selectOption(threadA, "scope", "Whole app");
    setCustomAnswer(threadA, "detail", longAnswer);
    advance(threadA);

    expect(stateFor(threadB)).toMatchObject({
      answersByRequestId: {},
      questionIndexByRequestId: {},
    });
    expect(stateFor(threadA).questionIndexByRequestId[requestId]).toBe(2);

    usePendingUserInputStore.getState().dispatch(threadA, { type: "previous", requestId });
    expect(stateFor(threadA).questionIndexByRequestId[requestId]).toBe(1);
    expect(stateFor(threadA).answersByRequestId[requestId]?.detail?.customAnswer).toBe(longAnswer);
  });

  it("isolates the same provider request id in different threads", () => {
    setCustomAnswer(threadA, "scope", "Thread A answer");
    setCustomAnswer(threadB, "scope", "Thread B answer");

    expect(stateFor(threadA).answersByRequestId[requestId]?.scope?.customAnswer).toBe(
      "Thread A answer",
    );
    expect(stateFor(threadB).answersByRequestId[requestId]?.scope?.customAnswer).toBe(
      "Thread B answer",
    );
  });

  it("round-trips draft answers and progress through persisted state", () => {
    const longAnswer = "Exact reload text\nwith a second line";
    selectOption(threadA, "scope", "Whole app");
    setCustomAnswer(threadA, "detail", longAnswer);
    advance(threadA);

    const persisted = partializePendingUserInputStoreState(usePendingUserInputStore.getState());
    resetPendingUserInputStoreForTest();
    usePendingUserInputStore.setState(normalizePendingUserInputStoreState(persisted));

    expect(stateFor(threadA).questionIndexByRequestId[requestId]).toBe(2);
    expect(stateFor(threadA).answersByRequestId[requestId]?.detail?.customAnswer).toBe(longAnswer);
  });

  it("returns a final submission once without persisting its intent", () => {
    selectOption(threadA, "scope", "Whole app");
    setCustomAnswer(threadA, "detail", "Keep it detailed");
    advance(threadA);
    selectOption(threadA, "tests", "Focused");
    const intent = selectOption(threadA, "ship", "Yes");

    expect(intent?.answers).toEqual({
      scope: "Whole app",
      detail: "Keep it detailed",
      tests: "Focused",
      ship: "Yes",
    });
    expect(stateFor(threadA).submissionIntent).toBeNull();
    expect(
      "submissionIntent" in
        partializePendingUserInputStoreState(usePendingUserInputStore.getState()).statesByThreadKey[
          threadA
        ]!,
    ).toBe(false);
  });

  it("keeps a submitted draft for retry until the request is closed", () => {
    selectOption(threadA, "scope", "Whole app");
    setCustomAnswer(threadA, "detail", "Retry this exact text");
    advance(threadA);
    selectOption(threadA, "tests", "Focused");
    expect(selectOption(threadA, "ship", "Yes")).not.toBeNull();

    expect(stateFor(threadA).answersByRequestId[requestId]?.detail?.customAnswer).toBe(
      "Retry this exact text",
    );
    usePendingUserInputStore.getState().clearRequests(threadA, new Set([requestId]));
    expect(usePendingUserInputStore.getState().statesByThreadKey[threadA]).toBeUndefined();
  });

  it("recovers expired text before clearing its saved draft", () => {
    const exactAnswer = "First line\n\nLast line stays exact.";
    setCustomAnswer(threadA, "detail", exactAnswer);

    const recovered = formatExpiredUserInputDraft(
      questions,
      stateFor(threadA).answersByRequestId[requestId] ?? {},
    );
    usePendingUserInputStore.getState().clearRequests(threadA, new Set([requestId]));

    expect(recovered).toBe(`Detail: ${exactAnswer}`);
    expect(usePendingUserInputStore.getState().statesByThreadKey[threadA]).toBeUndefined();
  });

  it("drops corrupt persisted shapes and any persisted submission intent", () => {
    expect(normalizePendingUserInputStoreState("{bad json")).toEqual({ statesByThreadKey: {} });
    expect(
      normalizePendingUserInputStoreState({
        statesByThreadKey: {
          [threadA]: {
            answersByRequestId: {
              [requestId]: { scope: { customAnswer: "Safe answer" } },
            },
            questionIndexByRequestId: { [requestId]: 1.9 },
            submissionIntent: {
              requestId,
              submissionId: 9,
              answers: { scope: "Safe answer" },
            },
            nextSubmissionId: 10,
          },
          broken: { answersByRequestId: "nope", questionIndexByRequestId: null },
        },
      }).statesByThreadKey,
    ).toEqual({
      [threadA]: {
        answersByRequestId: {
          [requestId]: { scope: { customAnswer: "Safe answer" } },
        },
        questionIndexByRequestId: { [requestId]: 1 },
        submissionIntent: null,
        nextSubmissionId: 10,
      },
    });
  });

  it("falls back to empty state when saved JSON cannot be parsed", async () => {
    const originalStorage = usePendingUserInputStore.persist.getOptions().storage;
    usePendingUserInputStore.persist.setOptions({
      storage: {
        getItem: () => JSON.parse("{bad saved json"),
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });

    try {
      await expect(usePendingUserInputStore.persist.rehydrate()).resolves.toBeUndefined();
      expect(usePendingUserInputStore.getState().statesByThreadKey).toEqual({});
    } finally {
      usePendingUserInputStore.persist.setOptions({ storage: originalStorage });
    }
  });
});
