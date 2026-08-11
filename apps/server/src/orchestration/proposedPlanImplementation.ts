/**
 * Pure decision helpers for the ProposedPlanImplementationReactor.
 *
 * Avi Code addition. Kept free of Effect so the reactor's branching can be
 * exhaustively unit-tested without driving the engine/stream loop.
 *
 * @module proposedPlanImplementation
 */

/**
 * A real, non-empty checkpoint diff is the authoritative "the agent did the
 * work" signal. Placeholder/missing diffs (e.g. non-git workspaces) carry an
 * empty file list and must not release the plan lock.
 */
export function diffEventMarksImplementation(input: {
  readonly status: string;
  readonly fileCount: number;
}): boolean {
  return input.status === "ready" && input.fileCount > 0;
}

export interface ActionablePlanCandidate {
  readonly id: string;
  readonly turnId: string | null;
  readonly implementedAt: string | null;
  readonly updatedAt: string;
}

/**
 * Pick the plan a change-producing turn should mark implemented: the latest
 * still-actionable plan on the thread that was *not* proposed by that same turn.
 *
 * The `turnId !== changeTurnId` guard skips a plan whose own proposal turn is the
 * one that changed files, so a single propose-and-build turn cannot mark a plan
 * implemented before the user has decided on it. Ordering matches the client's
 * `findLatestProposedPlan` (by `updatedAt`, then `id`).
 */
export function selectPlanToMarkImplemented<P extends ActionablePlanCandidate>(
  plans: readonly P[],
  changeTurnId: string,
): P | null {
  const actionable = plans
    .filter((plan) => plan.implementedAt === null && plan.turnId !== changeTurnId)
    .toSorted(
      (left, right) =>
        left.updatedAt.localeCompare(right.updatedAt) || left.id.localeCompare(right.id),
    );
  return actionable.at(-1) ?? null;
}
