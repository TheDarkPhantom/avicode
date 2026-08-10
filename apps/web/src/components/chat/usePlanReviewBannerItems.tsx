import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ClipboardCheckIcon } from "lucide-react";

import type {
  EnvironmentId,
  OrchestrationLatestTurn,
  OrchestrationProposedPlanId,
  OrchestrationSession,
  ProviderInteractionMode,
  ThreadId,
} from "@t3tools/contracts";
import { scopeThreadRef } from "@t3tools/client-runtime/environment";

import { useComposerDraftStore } from "../../composerDraftStore";
import {
  findCompletedPlanReviewShell,
  getCompletedPlanReviewSource,
  mergeThreadContextIds,
  type PlanReviewShellCandidate,
} from "../../planReview";
import { Button } from "../ui/button";
import type { ComposerBannerStackItem } from "./ComposerBannerStack";

/**
 * Avi Code addition: the plan-review return leg.
 *
 * "Review with Codex" hands a proposed plan to a new plan-mode thread; these
 * banners carry the findings back. In the review thread, a completed review
 * offers to attach itself to the plan thread's composer as a thread reference
 * and navigate there. In the plan thread, a completed review offers to attach
 * itself to the next message directly. Both go through the composer draft
 * store, so the user still edits and sends the message themselves.
 */
export function usePlanReviewBannerItems(input: {
  readonly activeThread: {
    readonly id: ThreadId;
    readonly environmentId: EnvironmentId;
    readonly interactionMode: ProviderInteractionMode;
    readonly session: OrchestrationSession | null;
  } | null;
  readonly activeLatestTurn: OrchestrationLatestTurn | null;
  readonly activeProposedPlanId: OrchestrationProposedPlanId | null;
  readonly showPlanFollowUpPrompt: boolean;
  readonly threadShells: ReadonlyArray<PlanReviewShellCandidate>;
  readonly scheduleComposerFocus: () => void;
}): ComposerBannerStackItem[] {
  const {
    activeThread,
    activeLatestTurn,
    activeProposedPlanId,
    showPlanFollowUpPrompt,
    threadShells,
    scheduleComposerFocus,
  } = input;
  const navigate = useNavigate();
  const [dismissedIds, setDismissedIds] = useState<ReadonlyArray<string>>([]);

  // Review thread: the completed review's back-link to the plan it audited.
  const reviewSource = getCompletedPlanReviewSource(
    activeThread,
    activeLatestTurn,
    activeThread?.session ?? null,
  );
  const planThreadExists =
    activeThread !== null &&
    reviewSource !== null &&
    threadShells.some(
      (shell) =>
        shell.environmentId === activeThread.environmentId && shell.id === reviewSource.threadId,
    );
  const planDraftHasFindings = useComposerDraftStore((state) =>
    activeThread && reviewSource
      ? (
          state.getComposerDraft(scopeThreadRef(activeThread.environmentId, reviewSource.threadId))
            ?.threadContextIds ?? []
        ).includes(activeThread.id)
      : false,
  );

  // Plan thread: the most recent completed review of the actionable plan.
  const reviewShell = useMemo(
    () =>
      activeThread && showPlanFollowUpPrompt && activeProposedPlanId
        ? findCompletedPlanReviewShell(threadShells, {
            environmentId: activeThread.environmentId,
            planThreadId: activeThread.id,
            planId: activeProposedPlanId,
          })
        : null,
    [activeProposedPlanId, activeThread, showPlanFollowUpPrompt, threadShells],
  );
  const activeDraftHasFindings = useComposerDraftStore((state) =>
    activeThread && reviewShell
      ? (
          state.getComposerDraft(scopeThreadRef(activeThread.environmentId, activeThread.id))
            ?.threadContextIds ?? []
        ).includes(reviewShell.id)
      : false,
  );

  const sendFindingsToPlanThread = useCallback(() => {
    if (!activeThread || !reviewSource) {
      return;
    }
    const planThreadRef = scopeThreadRef(activeThread.environmentId, reviewSource.threadId);
    const store = useComposerDraftStore.getState();
    const existing = store.getComposerDraft(planThreadRef)?.threadContextIds ?? [];
    store.setThreadContextIds(planThreadRef, mergeThreadContextIds(existing, activeThread.id));
    void navigate({
      to: "/$environmentId/$threadId",
      params: {
        environmentId: activeThread.environmentId,
        threadId: reviewSource.threadId,
      },
    });
  }, [activeThread, navigate, reviewSource]);

  const attachFindings = useCallback(() => {
    if (!activeThread || !reviewShell) {
      return;
    }
    const activeThreadRef = scopeThreadRef(activeThread.environmentId, activeThread.id);
    const store = useComposerDraftStore.getState();
    const existing = store.getComposerDraft(activeThreadRef)?.threadContextIds ?? [];
    store.setThreadContextIds(activeThreadRef, mergeThreadContextIds(existing, reviewShell.id));
    scheduleComposerFocus();
  }, [activeThread, reviewShell, scheduleComposerFocus]);

  return useMemo<ComposerBannerStackItem[]>(() => {
    const items: ComposerBannerStackItem[] = [];
    if (activeThread && reviewSource && planThreadExists && !planDraftHasFindings) {
      const id = `plan-review-send:${activeThread.id}:${activeLatestTurn?.turnId ?? "turn"}`;
      if (!dismissedIds.includes(id)) {
        items.push({
          id,
          variant: "info",
          icon: <ClipboardCheckIcon />,
          title: "Codex review finished",
          description: "Send the findings back to the plan thread as a thread reference.",
          actions: (
            <Button size="xs" variant="outline" onClick={sendFindingsToPlanThread}>
              Send findings to plan thread
            </Button>
          ),
          dismissLabel: "Dismiss review handoff",
          onDismiss: () => setDismissedIds((previous) => [...previous, id]),
        });
      }
    }
    if (activeThread && reviewShell && !activeDraftHasFindings) {
      const id = `plan-review-ready:${reviewShell.id}:${reviewShell.latestTurn?.turnId ?? "turn"}`;
      if (!dismissedIds.includes(id)) {
        items.push({
          id,
          variant: "info",
          icon: <ClipboardCheckIcon />,
          title: "Codex review ready",
          description: "Attach the review findings to your next message.",
          actions: (
            <Button size="xs" variant="outline" onClick={attachFindings}>
              Attach findings
            </Button>
          ),
          dismissLabel: "Dismiss review findings",
          onDismiss: () => setDismissedIds((previous) => [...previous, id]),
        });
      }
    }
    return items;
  }, [
    activeDraftHasFindings,
    activeLatestTurn?.turnId,
    activeThread,
    attachFindings,
    dismissedIds,
    planDraftHasFindings,
    planThreadExists,
    reviewShell,
    reviewSource,
    sendFindingsToPlanThread,
  ]);
}
