import { describe, expect, it } from "vite-plus/test";

import {
  canSubmitComposerProviderState,
  formatPendingPrimaryActionLabel,
  normalComposerPrimaryActionState,
} from "./ComposerPrimaryActions";

describe("formatPendingPrimaryActionLabel", () => {
  it("returns 'Submitting...' while responding", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: true,
        questionIndex: 0,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submitting...' while responding regardless of other flags", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: true,
        questionIndex: 3,
      }),
    ).toBe("Submitting...");
  });

  it("returns 'Submit' in compact mode on the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit");
  });

  it("returns 'Next' in compact mode when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: true,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Next");
  });

  it("returns 'Next question' when not the last question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: false,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Next question");
  });

  it("returns singular 'Submit answer' on the last question when it is the only question", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 0,
      }),
    ).toBe("Submit answer");
  });

  it("returns plural 'Submit answers' on the last question when there are multiple questions", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 1,
      }),
    ).toBe("Submit answers");
  });

  it("returns plural 'Submit answers' for higher question indices", () => {
    expect(
      formatPendingPrimaryActionLabel({
        compact: false,
        isLastQuestion: true,
        isResponding: false,
        questionIndex: 5,
      }),
    ).toBe("Submit answers");
  });
});

describe("normalComposerPrimaryActionState", () => {
  it("allows a disconnected message to be queued", () => {
    expect(
      normalComposerPrimaryActionState({
        isSendBusy: false,
        isConnecting: false,
        isEnvironmentUnavailable: true,
        hasQueuedTurn: false,
        hasSendableContent: true,
        isPreparingWorktree: false,
      }),
    ).toEqual({
      disabled: false,
      label: "Queue message until reconnected",
    });
  });

  it("prevents a second queued turn from racing the first", () => {
    expect(
      normalComposerPrimaryActionState({
        isSendBusy: false,
        isConnecting: false,
        isEnvironmentUnavailable: true,
        hasQueuedTurn: true,
        hasSendableContent: true,
        isPreparingWorktree: false,
      }),
    ).toEqual({
      disabled: true,
      label: "Message already queued",
    });
  });
});

describe("canSubmitComposerProviderState", () => {
  it("uses the cached selection only while the environment is unavailable", () => {
    expect(
      canSubmitComposerProviderState({
        providerAvailable: false,
        environmentUnavailable: true,
      }),
    ).toBe(true);
    expect(
      canSubmitComposerProviderState({
        providerAvailable: false,
        environmentUnavailable: false,
      }),
    ).toBe(false);
  });
});
