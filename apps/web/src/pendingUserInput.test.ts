import { describe, expect, it } from "vite-plus/test";

import {
  buildPendingUserInputAnswers,
  countAnsweredPendingUserInputQuestions,
  derivePendingUserInputProgress,
  findFirstUnansweredPendingUserInputQuestionIndex,
  formatExpiredUserInputAnswers,
  formatExpiredUserInputDraft,
  hasHandledExpiredUserInputRecovery,
  markExpiredUserInputRecoveryHandled,
  mergeExpiredUserInputWithComposerDraft,
  omitPendingUserInputRequestIds,
  initialPendingUserInputState,
  pendingUserInputReducer,
  resolvePendingUserInputAnswer,
  setPendingUserInputCustomAnswer,
  shouldDismissPendingUserInputForKey,
  togglePendingUserInputOptionSelection,
} from "./pendingUserInput";

const singleSelectQuestion = {
  id: "scope",
  header: "Scope",
  question: "What should the plan target first?",
  options: [
    {
      label: "Orchestration-first",
      description: "Focus on orchestration first",
    },
  ],
  multiSelect: false,
} as const;

const multiSelectQuestion = {
  id: "areas",
  header: "Areas",
  question: "Which areas should this change cover?",
  options: [
    {
      label: "Server",
      description: "Server",
    },
    {
      label: "Web",
      description: "Web",
    },
  ],
  multiSelect: true,
} as const;

const escapeEvent = {
  key: "Escape",
  defaultPrevented: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  targetOutsideComposer: false,
  isResponding: false,
} as const;

describe("shouldDismissPendingUserInputForKey", () => {
  it("dismisses on a bare Escape", () => {
    expect(shouldDismissPendingUserInputForKey(escapeEvent)).toBe(true);
  });

  it("ignores every other key", () => {
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, key: "Enter" })).toBe(false);
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, key: "1" })).toBe(false);
  });

  it("leaves chorded Escape to whoever owns the chord", () => {
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, metaKey: true })).toBe(false);
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, ctrlKey: true })).toBe(false);
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, altKey: true })).toBe(false);
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, shiftKey: true })).toBe(false);
  });

  it("stands down once another handler has taken the event", () => {
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, defaultPrevented: true })).toBe(
      false,
    );
  });

  it("leaves Escape to a focused menu or dialog instead of stopping the turn", () => {
    expect(
      shouldDismissPendingUserInputForKey({ ...escapeEvent, targetOutsideComposer: true }),
    ).toBe(false);
  });

  it("still dismisses when answer submission is stalled", () => {
    expect(shouldDismissPendingUserInputForKey({ ...escapeEvent, isResponding: true })).toBe(true);
  });
});

describe("resolvePendingUserInputAnswer", () => {
  it("prefers a custom answer over selected options", () => {
    expect(
      resolvePendingUserInputAnswer(singleSelectQuestion, {
        selectedOptionLabels: ["Orchestration-first"],
        customAnswer: "Keep the existing envelope for one release",
      }),
    ).toBe("Keep the existing envelope for one release");
  });

  it("falls back to the selected option for single-select questions", () => {
    expect(
      resolvePendingUserInputAnswer(singleSelectQuestion, {
        selectedOptionLabels: ["Orchestration-first"],
      }),
    ).toBe("Orchestration-first");
  });

  it("returns all selected labels for multi-select questions", () => {
    expect(
      resolvePendingUserInputAnswer(multiSelectQuestion, {
        selectedOptionLabels: ["Server", "Web"],
      }),
    ).toEqual(["Server", "Web"]);
  });

  it("clears the preset selection when a custom answer is entered", () => {
    expect(
      setPendingUserInputCustomAnswer(
        {
          selectedOptionLabels: ["Server", "Web"],
        },
        "doesn't matter",
      ),
    ).toEqual({
      customAnswer: "doesn't matter",
    });
  });
});

describe("togglePendingUserInputOptionSelection", () => {
  it("toggles options for multi-select questions", () => {
    expect(togglePendingUserInputOptionSelection(multiSelectQuestion, undefined, "Server")).toEqual(
      {
        customAnswer: "",
        selectedOptionLabels: ["Server"],
      },
    );

    expect(
      togglePendingUserInputOptionSelection(
        multiSelectQuestion,
        {
          selectedOptionLabels: ["Server", "Web"],
        },
        "Server",
      ),
    ).toEqual({
      customAnswer: "",
      selectedOptionLabels: ["Web"],
    });
  });
});

describe("pendingUserInputReducer", () => {
  const questions = [
    singleSelectQuestion,
    multiSelectQuestion,
    { ...singleSelectQuestion, id: "third", header: "Third" },
    { ...singleSelectQuestion, id: "fourth", header: "Fourth" },
  ] as const;
  const select = (
    state: typeof initialPendingUserInputState,
    questionId: string,
    optionLabel: string,
  ) =>
    pendingUserInputReducer(state, {
      type: "option-selected",
      requestId: "req-1",
      questions,
      questionId,
      optionLabel,
    });

  it("accumulates rapid multi-select choices without advancing", () => {
    let state = select(initialPendingUserInputState, "areas", "Server");
    state = select(state, "areas", "Web");
    expect(state.answersByRequestId["req-1"]?.areas?.selectedOptionLabels).toEqual([
      "Server",
      "Web",
    ]);
    expect(state.questionIndexByRequestId["req-1"]).toBeUndefined();

    state = select(state, "areas", "Server");
    expect(state.answersByRequestId["req-1"]?.areas?.selectedOptionLabels).toEqual(["Web"]);
  });

  it("moves forward exactly once for each single-select answer", () => {
    let state = select(initialPendingUserInputState, "scope", "Orchestration-first");
    expect(state.questionIndexByRequestId["req-1"]).toBe(1);

    state = select(state, "areas", "Server");
    state = pendingUserInputReducer(state, {
      type: "advance",
      requestId: "req-1",
      questions,
    });
    expect(state.questionIndexByRequestId["req-1"]).toBe(2);

    state = select(state, "third", "Orchestration-first");
    expect(state.questionIndexByRequestId["req-1"]).toBe(3);
  });

  it("only moves backward for an explicit previous action", () => {
    let state = select(initialPendingUserInputState, "scope", "Orchestration-first");
    state = select(state, "areas", "Server");
    state = pendingUserInputReducer(state, {
      type: "advance",
      requestId: "req-1",
      questions,
    });
    state = pendingUserInputReducer(state, { type: "previous", requestId: "req-1" });
    expect(state.questionIndexByRequestId["req-1"]).toBe(1);
  });

  it("submits the latest complete snapshot once and allows a retry", () => {
    let state = select(initialPendingUserInputState, "scope", "Orchestration-first");
    state = select(state, "areas", "Server");
    state = select(state, "areas", "Web");
    state = pendingUserInputReducer(state, {
      type: "advance",
      requestId: "req-1",
      questions,
    });
    state = select(state, "third", "Orchestration-first");
    state = select(state, "fourth", "Orchestration-first");
    expect(state.submissionIntent?.answers).toEqual({
      scope: "Orchestration-first",
      areas: ["Server", "Web"],
      third: "Orchestration-first",
      fourth: "Orchestration-first",
    });
    const firstSubmissionId = state.submissionIntent?.submissionId;
    state = pendingUserInputReducer(state, {
      type: "submission-consumed",
      submissionId: firstSubmissionId!,
    });
    expect(state.submissionIntent).toBeNull();
    state = pendingUserInputReducer(state, {
      type: "advance",
      requestId: "req-1",
      questions,
    });
    expect(state.submissionIntent?.submissionId).not.toBe(firstSubmissionId);
  });

  it("waits for explicit submission on a final multi-select question", () => {
    const finalQuestions = [singleSelectQuestion, multiSelectQuestion] as const;
    let state = pendingUserInputReducer(initialPendingUserInputState, {
      type: "option-selected",
      requestId: "req-1",
      questions: finalQuestions,
      questionId: "scope",
      optionLabel: "Orchestration-first",
    });
    state = pendingUserInputReducer(state, {
      type: "option-selected",
      requestId: "req-1",
      questions: finalQuestions,
      questionId: "areas",
      optionLabel: "Server",
    });
    expect(state.submissionIntent).toBeNull();
    state = pendingUserInputReducer(state, {
      type: "advance",
      requestId: "req-1",
      questions: finalQuestions,
    });
    expect(state.submissionIntent?.answers.areas).toEqual(["Server"]);
  });

  it("stores custom answers and clears expired requests", () => {
    let state = pendingUserInputReducer(initialPendingUserInputState, {
      type: "custom-answer-changed",
      requestId: "req-1",
      questionId: "scope",
      value: "Custom",
    });
    expect(state.answersByRequestId["req-1"]?.scope?.customAnswer).toBe("Custom");
    state = pendingUserInputReducer(state, {
      type: "requests-cleared",
      requestIds: new Set(["req-1"]),
    });
    expect(state.answersByRequestId["req-1"]).toBeUndefined();
  });
});

describe("buildPendingUserInputAnswers", () => {
  it("returns a canonical answer map for complete prompts", () => {
    expect(
      buildPendingUserInputAnswers(
        [
          singleSelectQuestion,
          {
            id: "compat",
            header: "Compat",
            question: "How strict should compatibility be?",
            options: [
              {
                label: "Keep current envelope",
                description: "Preserve current wire format",
              },
            ],
            multiSelect: false,
          },
        ],
        {
          scope: {
            selectedOptionLabels: ["Orchestration-first"],
          },
          compat: {
            customAnswer: "Keep the current envelope for one release window",
          },
        },
      ),
    ).toEqual({
      scope: "Orchestration-first",
      compat: "Keep the current envelope for one release window",
    });
  });

  it("returns arrays for answered multi-select prompts", () => {
    expect(
      buildPendingUserInputAnswers([multiSelectQuestion], {
        areas: {
          selectedOptionLabels: ["Server", "Web"],
        },
      }),
    ).toEqual({
      areas: ["Server", "Web"],
    });
  });

  it("returns null when any question is unanswered", () => {
    expect(buildPendingUserInputAnswers([singleSelectQuestion], {})).toBeNull();
  });
});

describe("pending user input question progress", () => {
  const questions = [
    singleSelectQuestion,
    {
      id: "compat",
      header: "Compat",
      question: "How strict should compatibility be?",
      options: [
        {
          label: "Keep current envelope",
          description: "Preserve current wire format",
        },
      ],
      multiSelect: false,
    },
  ] as const;

  it("counts only answered questions", () => {
    expect(
      countAnsweredPendingUserInputQuestions(questions, {
        scope: {
          selectedOptionLabels: ["Orchestration-first"],
        },
      }),
    ).toBe(1);
  });

  it("finds the first unanswered question", () => {
    expect(
      findFirstUnansweredPendingUserInputQuestionIndex(questions, {
        scope: {
          selectedOptionLabels: ["Orchestration-first"],
        },
      }),
    ).toBe(1);
  });

  it("returns the last question index when all answers are complete", () => {
    expect(
      findFirstUnansweredPendingUserInputQuestionIndex(questions, {
        scope: {
          selectedOptionLabels: ["Orchestration-first"],
        },
        compat: {
          customAnswer: "Keep it for one release window",
        },
      }),
    ).toBe(1);
  });

  it("derives the active question and advancement state", () => {
    expect(
      derivePendingUserInputProgress(
        questions,
        {
          scope: {
            selectedOptionLabels: ["Orchestration-first"],
          },
        },
        0,
      ),
    ).toMatchObject({
      questionIndex: 0,
      activeQuestion: questions[0],
      selectedOptionLabels: ["Orchestration-first"],
      customAnswer: "",
      resolvedAnswer: "Orchestration-first",
      answeredQuestionCount: 1,
      isLastQuestion: false,
      isComplete: false,
      canAdvance: true,
    });
  });

  it("treats multi-select questions as answered when they have selected options", () => {
    expect(
      derivePendingUserInputProgress(
        [multiSelectQuestion],
        {
          areas: {
            selectedOptionLabels: ["Server", "Web"],
          },
        },
        0,
      ),
    ).toMatchObject({
      selectedOptionLabels: ["Server", "Web"],
      resolvedAnswer: ["Server", "Web"],
      canAdvance: true,
      isComplete: true,
    });
  });
});

describe("formatExpiredUserInputDraft", () => {
  it("returns null when nothing was drafted", () => {
    expect(formatExpiredUserInputDraft([singleSelectQuestion, multiSelectQuestion], {})).toBe(null);
  });

  it("renders a single-select answer", () => {
    expect(
      formatExpiredUserInputDraft([singleSelectQuestion], {
        scope: { selectedOptionLabels: ["Orchestration-first"] },
      }),
    ).toBe("Scope: Orchestration-first");
  });

  it("joins a multi-select answer", () => {
    expect(
      formatExpiredUserInputDraft([multiSelectQuestion], {
        areas: { selectedOptionLabels: ["Server", "Web"] },
      }),
    ).toBe("Areas: Server, Web");
  });

  it("prefers a custom answer over selected options", () => {
    expect(
      formatExpiredUserInputDraft([singleSelectQuestion], {
        scope: { selectedOptionLabels: ["Orchestration-first"], customAnswer: "Neither" },
      }),
    ).toBe("Scope: Neither");
  });

  it("skips questions that were never answered", () => {
    expect(
      formatExpiredUserInputDraft([singleSelectQuestion, multiSelectQuestion], {
        areas: { selectedOptionLabels: ["Web"] },
      }),
    ).toBe("Areas: Web");
  });
});

describe("formatExpiredUserInputAnswers", () => {
  it("restores persisted custom and multiple-choice answers", () => {
    expect(
      formatExpiredUserInputAnswers([singleSelectQuestion, multiSelectQuestion], {
        scope: "A long custom answer",
        areas: ["Server", "Web"],
      }),
    ).toBe("Scope: A long custom answer\nAreas: Server, Web");
  });

  it("returns null for an old expiry without persisted answers", () => {
    expect(formatExpiredUserInputAnswers([singleSelectQuestion], {})).toBe(null);
  });
});

describe("mergeExpiredUserInputWithComposerDraft", () => {
  it("does not overwrite text already in the composer", () => {
    expect(mergeExpiredUserInputWithComposerDraft("Current draft", "Recovered answer")).toBe(
      "Current draft\n\nRecovered answer",
    );
  });

  it("uses the recovered answer directly for an empty composer", () => {
    expect(mergeExpiredUserInputWithComposerDraft("", "Recovered answer")).toBe("Recovered answer");
  });
});

describe("expired user-input recovery receipt", () => {
  it("remembers a restored request across renderer reloads", () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    };
    expect(hasHandledExpiredUserInputRecovery(storage, "req-1")).toBe(false);
    markExpiredUserInputRecoveryHandled(storage, "req-1");
    expect(hasHandledExpiredUserInputRecovery(storage, "req-1")).toBe(true);
    expect(hasHandledExpiredUserInputRecovery(storage, "req-2")).toBe(false);
  });
});

describe("omitPendingUserInputRequestIds", () => {
  it("returns the same object when nothing matches, so state setters do not re-render", () => {
    const entries = { "req-1": 0 };
    expect(omitPendingUserInputRequestIds(entries, new Set(["req-2"]))).toBe(entries);
  });

  it("drops only the matching request ids", () => {
    expect(omitPendingUserInputRequestIds({ "req-1": 0, "req-2": 1 }, new Set(["req-1"]))).toEqual({
      "req-2": 1,
    });
  });
});
