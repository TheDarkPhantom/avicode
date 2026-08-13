import type { ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey } from "@t3tools/client-runtime/environment";

import { readThreadShell } from "./state/entities";
import { useUiStateStore } from "./uiStateStore";

type NavigationType = "navigate" | "reload" | "back_forward" | "prerender";

let activeRouteKey: string | null = null;
let hasObservedThreadRoute = false;
let pendingLeave: ReturnType<typeof setTimeout> | null = null;
const suppressedRouteKeys = new Set<string>();
const pendingVisitKeys = new Set<string>();

export function currentNavigationType(): NavigationType {
  if (typeof performance === "undefined") return "navigate";
  const entry = performance.getEntriesByType("navigation")[0] as
    | PerformanceNavigationTiming
    | undefined;
  return entry?.type ?? "navigate";
}

export function suppressNextThreadRouteVisit(threadRef: ScopedThreadRef): void {
  const key = scopedThreadKey(threadRef);
  suppressedRouteKeys.add(key);
  pendingVisitKeys.delete(key);
}

export function beginThreadRouteVisit(
  threadRef: ScopedThreadRef,
  navigationType: NavigationType = currentNavigationType(),
): void {
  if (pendingLeave !== null) {
    clearTimeout(pendingLeave);
    pendingLeave = null;
  }
  const key = scopedThreadKey(threadRef);
  const suppressed = suppressedRouteKeys.delete(key);
  const shouldVisit =
    !suppressed &&
    (!hasObservedThreadRoute ? navigationType === "navigate" : activeRouteKey !== key);
  hasObservedThreadRoute = true;
  activeRouteKey = key;
  if (shouldVisit) pendingVisitKeys.add(key);
}

export function endThreadRouteVisit(threadRef: ScopedThreadRef): void {
  const key = scopedThreadKey(threadRef);
  if (pendingLeave !== null) clearTimeout(pendingLeave);
  pendingLeave = setTimeout(() => {
    if (activeRouteKey === key) activeRouteKey = null;
    pendingLeave = null;
  }, 0);
}

export function acknowledgeThreadVisit(
  threadRef: ScopedThreadRef,
  updatedAt?: string | undefined,
): void {
  const threadUpdatedAt = updatedAt ?? readThreadShell(threadRef)?.updatedAt;
  if (!threadUpdatedAt) return;
  useUiStateStore.getState().markThreadVisited(scopedThreadKey(threadRef), threadUpdatedAt);
}

export function acknowledgePendingThreadRouteVisit(
  threadRef: ScopedThreadRef,
  updatedAt: string,
): void {
  const key = scopedThreadKey(threadRef);
  if (!pendingVisitKeys.delete(key)) return;
  acknowledgeThreadVisit(threadRef, updatedAt);
}

export function resetThreadVisitRouteStateForTests(): void {
  if (pendingLeave !== null) clearTimeout(pendingLeave);
  pendingLeave = null;
  activeRouteKey = null;
  hasObservedThreadRoute = false;
  suppressedRouteKeys.clear();
  pendingVisitKeys.clear();
}
