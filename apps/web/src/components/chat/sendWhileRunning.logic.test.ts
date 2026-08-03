import { describe, expect, it } from "vite-plus/test";

import {
  addHeldSend,
  removeHeldSend,
  shouldFlushHeldSend,
  shouldHoldSendWhileRunning,
} from "./sendWhileRunning.logic";

describe("shouldHoldSendWhileRunning", () => {
  it("never holds on the default steer setting", () => {
    expect(
      shouldHoldSendWhileRunning({ setting: "steer", phase: "running", bypassHold: false }),
    ).toBe(false);
  });

  it("holds a send made during a running turn when queueing", () => {
    expect(
      shouldHoldSendWhileRunning({ setting: "queue", phase: "running", bypassHold: false }),
    ).toBe(true);
  });

  it("does not hold when the thread is idle", () => {
    for (const phase of ["idle", "completed", null, undefined]) {
      expect(shouldHoldSendWhileRunning({ setting: "queue", phase, bypassHold: false })).toBe(
        false,
      );
    }
  });

  it("lets Send now through even mid-turn", () => {
    expect(
      shouldHoldSendWhileRunning({ setting: "queue", phase: "running", bypassHold: true }),
    ).toBe(false);
  });
});

describe("shouldFlushHeldSend", () => {
  const base = {
    heldThreadKeys: ["env:thread-1"],
    activeThreadKey: "env:thread-1",
    phase: "completed",
    isSendBusy: false,
    isConnecting: false,
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
});

describe("addHeldSend and removeHeldSend", () => {
  it("adds a thread once and keeps the array identity when it is already held", () => {
    const held = addHeldSend([], "a");
    expect(held).toEqual(["a"]);
    expect(addHeldSend(held, "a")).toBe(held);
    expect(addHeldSend(held, "b")).toEqual(["a", "b"]);
  });

  it("removes only the named thread and keeps identity when there is nothing to remove", () => {
    const held = ["a", "b"];
    expect(removeHeldSend(held, "a")).toEqual(["b"]);
    expect(removeHeldSend(held, "c")).toBe(held);
  });
});
