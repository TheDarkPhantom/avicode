import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  registerStartInPlanModeReader,
  resolveInitialInteractionMode,
  resolveNewThreadInteractionMode,
} from "./aviCodeInteractionMode";

function setStartInPlanMode(enabled: boolean): void {
  registerStartInPlanModeReader(() => enabled);
}

afterEach(() => {
  // The reader is module state shared across tests; put it back to the
  // pre-registration default so ordering cannot leak a setting.
  registerStartInPlanModeReader(() => false);
});

describe("resolveInitialInteractionMode", () => {
  it("opens a new chat in plan mode when the setting is on", () => {
    setStartInPlanMode(true);
    expect(resolveInitialInteractionMode()).toBe("plan");
  });

  it("falls back to the upstream default when the setting is off", () => {
    setStartInPlanMode(false);
    expect(resolveInitialInteractionMode()).toBe("default");
  });
});

describe("resolveNewThreadInteractionMode", () => {
  it("beats the mode carried from the chat the user was looking at", () => {
    // The regression this exists for. You are nearly always in some chat when
    // you press New, so a carried "default" used to override the setting on
    // every new chat and the preference looked dead.
    setStartInPlanMode(true);
    expect(resolveNewThreadInteractionMode("default")).toBe("plan");
  });

  it("still reports plan when there is nothing to carry", () => {
    setStartInPlanMode(true);
    expect(resolveNewThreadInteractionMode(null)).toBe("plan");
    expect(resolveNewThreadInteractionMode(undefined)).toBe("plan");
  });

  it("leaves the carry alone when the setting is off", () => {
    // Carrying is how a run of chats stays in the mode you picked without
    // touching the toggle each time, so switching the setting off must give
    // upstream's behaviour back exactly.
    setStartInPlanMode(false);
    expect(resolveNewThreadInteractionMode("plan")).toBe("plan");
    expect(resolveNewThreadInteractionMode("default")).toBe("default");
  });

  it("reports no opinion when the setting is off and nothing was carried", () => {
    // Null lets the caller's own default apply rather than forcing a mode.
    setStartInPlanMode(false);
    expect(resolveNewThreadInteractionMode(null)).toBeNull();
    expect(resolveNewThreadInteractionMode(undefined)).toBeNull();
  });
});
