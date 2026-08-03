import type { ProjectScript, ScopedThreadRef } from "@t3tools/contracts";
import { useCallback, useEffect, useState } from "react";

import { openUrlInPreview, type OpenPreviewMutation } from "~/browser/openFileInPreview";
import { useThreadDiscoveredPorts } from "~/portDiscoveryState";

import {
  resolveAutoOpenPreviewRequest,
  resolvePendingScriptPreviewOutcome,
  type PendingScriptPreview,
} from "./autoOpenScriptPreview";

interface PendingRequest {
  readonly threadRef: ScopedThreadRef;
  readonly preview: PendingScriptPreview;
}

/**
 * Avi Code addition: honours `ProjectScript.autoOpenPreview`, which was
 * persisted and offered in the script form but read by nothing, so the toggle
 * had no effect.
 *
 * The request is held against the thread that started the script rather than
 * against whichever thread is on screen, so navigating away while a dev server
 * boots does not lose the preview. Only one request is held at a time: starting
 * a second previewing script supersedes the first, which is what the user just
 * asked for.
 */
export function useAutoOpenScriptPreview(
  openPreview: OpenPreviewMutation<unknown>,
): (input: {
  readonly script: Pick<ProjectScript, "previewUrl" | "autoOpenPreview">;
  readonly threadRef: ScopedThreadRef;
}) => void {
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const discoveredPorts = useThreadDiscoveredPorts({
    environmentId: pending?.threadRef.environmentId ?? null,
    threadId: pending?.threadRef.threadId ?? null,
  });
  // A separate counter, bumped once at the deadline, is what lets a request
  // give up: the scanner reports nothing new when a server never binds, so
  // waiting on `discoveredPorts` alone would leave the request pending forever.
  const [deadlineTick, setDeadlineTick] = useState(0);

  useEffect(() => {
    if (pending === null) return;
    const delay = Math.max(0, pending.preview.expiresAtMs - Date.now());
    const timer = window.setTimeout(() => {
      setDeadlineTick((value) => value + 1);
    }, delay + 1);
    return () => {
      window.clearTimeout(timer);
    };
  }, [pending]);

  useEffect(() => {
    if (pending === null) return;
    const outcome = resolvePendingScriptPreviewOutcome({
      pending: pending.preview,
      discoveredPorts,
      nowMs: Date.now(),
    });
    if (outcome === "wait") return;
    setPending(null);
    if (outcome === "open") {
      void openUrlInPreview({
        threadRef: pending.threadRef,
        url: pending.preview.url,
        openPreview,
      });
    }
  }, [deadlineTick, discoveredPorts, openPreview, pending]);

  return useCallback((input) => {
    const preview = resolveAutoOpenPreviewRequest({
      script: input.script,
      threadId: input.threadRef.threadId,
      nowMs: Date.now(),
    });
    // A script with no preview of its own leaves an in-flight request alone:
    // running `test` while `dev` boots should not cancel the preview.
    if (preview === null) return;
    setPending({ threadRef: input.threadRef, preview });
  }, []);
}
