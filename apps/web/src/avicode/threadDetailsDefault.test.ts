import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";

import { selectThreadPanelOpen, useRightPanelStore } from "../rightPanelStore";
import { registerShowThreadDetailsSource } from "./threadDetailsDefault";

const ref = scopeThreadRef("env-1" as EnvironmentId, ThreadId.make("thread-A"));

let show = true;
const listeners = new Set<() => void>();
function setShowThreadDetails(next: boolean): void {
  show = next;
  for (const listener of listeners) listener();
}

registerShowThreadDetailsSource(
  () => show,
  (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
);

const inlineOpen = () =>
  selectThreadPanelOpen(
    useRightPanelStore.getState().threadPanelVisibilityByThreadKey,
    ref,
    "inline",
  );

beforeEach(() => {
  show = true;
  useRightPanelStore.setState({ threadPanelVisibilityByThreadKey: {} });
});

afterEach(() => setShowThreadDetails(true));

describe("aviCodeShowThreadDetails", () => {
  it("is on by default", () => {
    expect(DEFAULT_CLIENT_SETTINGS.aviCodeShowThreadDetails).toBe(true);
  });

  it("opens the inline card by default when on", () => {
    expect(inlineOpen()).toBe(true);
  });

  it("closes the inline card in every chat when off", () => {
    setShowThreadDetails(false);
    expect(inlineOpen()).toBe(false);
  });

  it("still lets one chat open its card when off", () => {
    setShowThreadDetails(false);
    useRightPanelStore.getState().toggleThreadPanel(ref, "inline");
    expect(inlineOpen()).toBe(true);
    useRightPanelStore.getState().toggleThreadPanel(ref, "inline");
    expect(inlineOpen()).toBe(false);
  });

  it("gives selectors a new map when the setting flips", () => {
    const before = useRightPanelStore.getState().threadPanelVisibilityByThreadKey;
    setShowThreadDetails(false);
    expect(useRightPanelStore.getState().threadPanelVisibilityByThreadKey).not.toBe(before);
  });
});
