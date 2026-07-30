import { useParams } from "@tanstack/react-router";
import { scopeThreadRef, scopedThreadKey } from "@t3tools/client-runtime/environment";
import { useEffect, useRef } from "react";

import { useClientSettings } from "../hooks/useSettings";
import { useWindowActive } from "../hooks/useWindowActive";
import { playNotificationChime } from "../lib/notificationChime";
import {
  resolveAttentionChimes,
  resolveThreadAttention,
  type ThreadAttentionKind,
} from "../lib/threadAttention";
import { useAllEnvironmentShellsBootstrapped, useThreadShells } from "../state/entities";
import { resolveThreadRouteTarget } from "../threadRoutes";
import { useUiStateStore } from "../uiStateStore";

/**
 * Headless watcher that plays a chime when any thread starts waiting on the
 * user. Mounted once for the whole chat shell, because the point of the
 * feature is to reach someone who is not looking at the sidebar — or at the
 * app at all.
 */
export function ThreadAttentionChime(): null {
  const enabled = useClientSettings((settings) => settings.notificationSoundEnabled);
  const sound = useClientSettings((settings) => settings.aviCodeNotificationSound);
  const shells = useThreadShells();
  const bootstrapped = useAllEnvironmentShellsBootstrapped();
  const threadLastVisitedAtById = useUiStateStore((state) => state.threadLastVisitedAtById);
  const windowActive = useWindowActive();
  const routeTarget = useParams({
    strict: false,
    select: (params) => resolveThreadRouteTarget(params),
  });
  const routeThreadKey =
    routeTarget?.kind === "server" ? scopedThreadKey(routeTarget.threadRef) : null;

  // Null means "no baseline yet": the next pass records states without
  // sounding any of them.
  const previousAttentionRef = useRef<ReadonlyMap<string, ThreadAttentionKind | null> | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Drop the baseline so turning the setting back on starts from silence
      // instead of replaying every state change that happened while it was off.
      previousAttentionRef.current = null;
      return;
    }
    // Shells stream in per environment. Taking a baseline mid-bootstrap would
    // treat the rest of the arriving threads as fresh transitions.
    if (!bootstrapped) return;

    const current = new Map<string, ThreadAttentionKind | null>();
    for (const shell of shells) {
      const threadKey = scopedThreadKey(scopeThreadRef(shell.environmentId, shell.id));
      current.set(threadKey, resolveThreadAttention(shell, threadLastVisitedAtById[threadKey]));
    }

    const previous = previousAttentionRef.current;
    previousAttentionRef.current = current;
    if (previous === null) return;

    const chimes = resolveAttentionChimes({
      previous,
      current,
      // Only a focused window counts as looking: with the app in the
      // background, the thread on screen is as unseen as any other.
      suppressedThreadKey: windowActive ? routeThreadKey : null,
    });
    // One sound per pass, however many threads moved at once.
    if (chimes.length > 0) {
      playNotificationChime(sound);
    }
  }, [bootstrapped, enabled, routeThreadKey, shells, sound, threadLastVisitedAtById, windowActive]);

  return null;
}
