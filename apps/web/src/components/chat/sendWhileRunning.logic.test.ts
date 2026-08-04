import { describe, expect, it } from "vite-plus/test";

import { shouldFlushHeldSend, shouldHoldSendWhileRunning } from "./sendWhileRunning.logic";

describe("shouldHoldSendWhileRunning", () => {
  it("never holds on the default steer setting", () => {
    expect(shouldHoldSendWhileRunning({ setting: "steer", phase: "running" })).toBe(false);
  });

  it("holds a send made during a running turn when queueing", () => {
    expect(shouldHoldSendWhileRunning({ setting: "queue", phase: "running" })).toBe(true);
  });

  it("does not hold when the thread is idle", () => {
    for (const phase of ["idle", "completed", null, undefined]) {
      expect(shouldHoldSendWhileRunning({ setting: "queue", phase })).toBe(false);
    }
  });
});

describe("shouldFlushHeldSend", () => {
  const base = {
    heldThreadKeys: ["env:thread-1"],
    activeThreadKey: "env:thread-1",
    phase: "completed",
    isSendBusy: false,
    isConnecting: false,
    hasPendingUserInput: false,
    environmentUnavailable: false,
  };

  it("flushes once the held thread is free", () => {
    expect(shouldFlushHeldSend(base)).toBe(true);
  });

  it("waits while the turn is still running", () => {
    expect(shouldFlushHeldSend({ ...base, phase: "running" })).toBe(false);
  });

  it("waits while a send is already in flight or the thread is connecting", () => {
    expect(shouldFlushHeldSend({ ...base, isSendBusy: true })).toBe(false);
    expect(shouldFlushHeldSend({ ...base, isConnecting: true })).toBe(false);
  });

  it("does not flush another thread's hold", () => {
    expect(shouldFlushHeldSend({ ...base, activeThreadKey: "env:thread-2" })).toBe(false);
  });

  it("does not flush with no active thread or no hold", () => {
    expect(shouldFlushHeldSend({ ...base, activeThreadKey: null })).toBe(false);
    expect(shouldFlushHeldSend({ ...base, heldThreadKeys: [] })).toBe(false);
  });

  it("waits while a question is on screen, so the flush cannot answer it", () => {
    expect(shouldFlushHeldSend({ ...base, hasPendingUserInput: true })).toBe(false);
  });

  it("keeps the hold rather than dispatching into a dropped connection", () => {
    expect(shouldFlushHeldSend({ ...base, environmentUnavailable: true })).toBe(false);
  });
});
