import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import {
  acknowledgePendingThreadRouteVisit,
  beginThreadRouteVisit,
  resetThreadVisitRouteStateForTests,
  suppressNextThreadRouteVisit,
} from "./threadVisit";
import { useUiStateStore } from "./uiStateStore";

const first = scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-1"));
const second = scopeThreadRef(EnvironmentId.make("environment-1"), ThreadId.make("thread-2"));

function lastVisit(threadRef = first): string | undefined {
  return useUiStateStore.getState().threadLastVisitedAtById[scopedThreadKey(threadRef)];
}

describe("thread route visits", () => {
  beforeEach(() => {
    resetThreadVisitRouteStateForTests();
    useUiStateStore.setState({ threadLastVisitedAtById: {} });
  });

  it("does not mark a reload as a deliberate visit", () => {
    beginThreadRouteVisit(first, "reload");
    acknowledgePendingThreadRouteVisit(first, "2026-08-14T00:00:00.000Z");
    expect(lastVisit()).toBeUndefined();
  });

  it("marks a direct navigation and a later route change", () => {
    beginThreadRouteVisit(first, "navigate");
    acknowledgePendingThreadRouteVisit(first, "2026-08-14T00:00:00.000Z");
    expect(lastVisit()).toBe("2026-08-14T00:00:00.000Z");

    beginThreadRouteVisit(second, "navigate");
    acknowledgePendingThreadRouteVisit(second, "2026-08-14T00:01:00.000Z");
    expect(lastVisit(second)).toBe("2026-08-14T00:01:00.000Z");
  });

  it("does not mark an automatic bootstrap route", () => {
    suppressNextThreadRouteVisit(first);
    beginThreadRouteVisit(first, "navigate");
    acknowledgePendingThreadRouteVisit(first, "2026-08-14T00:00:00.000Z");
    expect(lastVisit()).toBeUndefined();
  });

  it("does not count a strict-mode remount twice", () => {
    beginThreadRouteVisit(first, "navigate");
    acknowledgePendingThreadRouteVisit(first, "2026-08-14T00:00:00.000Z");
    beginThreadRouteVisit(first, "navigate");
    acknowledgePendingThreadRouteVisit(first, "2026-08-14T00:01:00.000Z");
    expect(lastVisit()).toBe("2026-08-14T00:00:00.000Z");
  });
});
