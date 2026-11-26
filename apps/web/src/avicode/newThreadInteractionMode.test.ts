import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, describe, expect, it } from "vite-plus/test";

import {
  registerStartInPlanModeReader,
  resolveInitialInteractionMode,
  resolveNewThreadInteractionMode,
} from "./newThreadInteractionMode";

function setStartInPlanMode(enabled: boolean): void {
  registerStartInPlanModeReader(() => enabled);
}

afterEach(() => {
  registerStartInPlanModeReader(() => false);
});

describe("aviCodeNewThreadsStartInPlanMode", () => {
  it("is off by default", () => {
    expect(DEFAULT_CLIENT_SETTINGS.aviCodeNewThreadsStartInPlanMode).toBe(false);
  });
});

describe("resolveInitialInteractionMode", () => {
  it("seeds plan mode when the setting is on", () => {
    setStartInPlanMode(true);
    expect(resolveInitialInteractionMode()).toBe("plan");
  });

  it("seeds the upstream default when the setting is off", () => {
    setStartInPlanMode(false);
    expect(resolveInitialInteractionMode()).toBe("default");
  });
});

describe("resolveNewThreadInteractionMode", () => {
  it("beats the mode carried from the current chat when the setting is on", () => {
    setStartInPlanMode(true);
    expect(resolveNewThreadInteractionMode("default")).toBe("plan");
    expect(resolveNewThreadInteractionMode("plan")).toBe("plan");
  });

  it("reports plan when the setting is on and nothing was carried", () => {
    setStartInPlanMode(true);
    expect(resolveNewThreadInteractionMode(null)).toBe("plan");
    expect(resolveNewThreadInteractionMode(undefined)).toBe("plan");
  });

  it("keeps the carried mode when the setting is off", () => {
    setStartInPlanMode(false);
    expect(resolveNewThreadInteractionMode("plan")).toBe("plan");
    expect(resolveNewThreadInteractionMode("default")).toBe("default");
  });

  it("has no opinion when the setting is off and nothing was carried", () => {
    setStartInPlanMode(false);
    expect(resolveNewThreadInteractionMode(null)).toBeNull();
    expect(resolveNewThreadInteractionMode(undefined)).toBeNull();
  });
});
