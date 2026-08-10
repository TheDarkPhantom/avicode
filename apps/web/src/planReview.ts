import type {
  EnvironmentId,
  OrchestrationLatestTurn,
  OrchestrationProposedPlanId,
  OrchestrationSession,
  ProviderInteractionMode,
  ThreadId,
} from "@t3tools/contracts";

import { isLatestTurnSettled } from "./session-logic";

/**
 * Avi Code addition: predicates for the plan-review return leg. A review
 * thread is a plan-mode thread whose latest turn references another thread's
 * proposed plan (only the "Review with Codex" flow creates that shape);
 * implement threads run in default mode, so they never match.
 */

export interface PlanReviewSourceRef {
  readonly threadId: ThreadId;
  readonly planId: OrchestrationProposedPlanId;
}

type PlanReviewLatestTurn = Pick<
  OrchestrationLatestTurn,
  "turnId" | "state" | "startedAt" | "completedAt" | "sourceProposedPlan"
>;
type PlanReviewSession = Pick<OrchestrationSession, "status" | "activeTurnId"> | null;

export interface PlanReviewShellCandidate {
  readonly id: ThreadId;
  readonly environmentId: EnvironmentId;
  readonly interactionMode: ProviderInteractionMode;
  readonly latestTurn: PlanReviewLatestTurn | null;
  readonly session: PlanReviewSession;
}

/** Returns the source plan referenced by a review thread in any turn state. */
export function getPlanReviewSource(
  thread: { id: ThreadId; interactionMode: ProviderInteractionMode } | null,
  latestTurn: PlanReviewLatestTurn | null,
): PlanReviewSourceRef | null {
  if (!thread || thread.interactionMode !== "plan") {
    return null;
  }
  const source = latestTurn?.sourceProposedPlan;
  if (!source || source.threadId === thread.id) {
    return null;
  }
  return source;
}

/**
 * Returns the plan a finished review thread audited, or null when the thread
 * is not a settled, completed review thread.
 */
export function getCompletedPlanReviewSource(
  thread: { id: ThreadId; interactionMode: ProviderInteractionMode } | null,
  latestTurn: PlanReviewLatestTurn | null,
  session: PlanReviewSession,
): PlanReviewSourceRef | null {
  const source = getPlanReviewSource(thread, latestTurn);
  if (!source || !latestTurn) {
    return null;
  }
  if (latestTurn.state !== "completed" || !isLatestTurnSettled(latestTurn, session)) {
    return null;
  }
  return source;
}

/** Finds the newest review thread for a plan, including an active or awaiting-input review. */
export function findLatestPlanReviewShell<Shell extends PlanReviewShellCandidate>(
  shells: ReadonlyArray<Shell>,
  input: {
    readonly environmentId: EnvironmentId;
    readonly planThreadId: ThreadId;
    readonly planId: OrchestrationProposedPlanId;
  },
): Shell | null {
  let latest: Shell | null = null;
  for (const shell of shells) {
    if (shell.environmentId !== input.environmentId) continue;
    const source = getPlanReviewSource(shell, shell.latestTurn);
    if (!source || source.threadId !== input.planThreadId || source.planId !== input.planId) {
      continue;
    }
    const candidateKey = [
      shell.latestTurn?.startedAt ?? "",
      shell.latestTurn?.turnId ?? "",
      shell.id,
    ].join(":");
    const latestKey = [
      latest?.latestTurn?.startedAt ?? "",
      latest?.latestTurn?.turnId ?? "",
      latest?.id ?? "",
    ].join(":");
    if (latest === null || candidateKey > latestKey) latest = shell;
  }
  return latest;
}

/**
 * Finds the most recently completed review thread for a plan. Multiple
 * reviews of the same plan resolve to the latest completed one.
 */
export function findCompletedPlanReviewShell<Shell extends PlanReviewShellCandidate>(
  shells: ReadonlyArray<Shell>,
  input: {
    readonly environmentId: EnvironmentId;
    readonly planThreadId: ThreadId;
    readonly planId: OrchestrationProposedPlanId;
  },
): Shell | null {
  let latest: Shell | null = null;
  for (const shell of shells) {
    if (shell.environmentId !== input.environmentId) {
      continue;
    }
    const source = getCompletedPlanReviewSource(shell, shell.latestTurn, shell.session);
    if (!source || source.threadId !== input.planThreadId || source.planId !== input.planId) {
      continue;
    }
    const completedAt = shell.latestTurn?.completedAt ?? "";
    const latestCompletedAt = latest?.latestTurn?.completedAt ?? "";
    if (latest === null || completedAt > latestCompletedAt) {
      latest = shell;
    }
  }
  return latest;
}

/** Appends a thread reference unless it is already present. */
export function mergeThreadContextIds(
  existing: ReadonlyArray<ThreadId>,
  threadId: ThreadId,
): ThreadId[] {
  return existing.includes(threadId) ? [...existing] : [...existing, threadId];
}
