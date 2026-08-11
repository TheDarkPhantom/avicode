/**
 * ProposedPlanImplementationReactor - marks a proposed plan implemented once a
 * turn actually produces file changes.
 *
 * Avi Code addition. The Plan/Build lock keeps a settled plan "actionable"
 * (`implementedAt === null`) until it is implemented. Historically the only
 * writer of `implementedAt` was the Implement button (a `turn.started` carrying
 * a client-supplied `sourceProposedPlan` reference), which marks on *intent*,
 * not on real work. Any other path - typing an approval, or a provider that
 * builds during a plan-mode turn - left the plan locked forever.
 *
 * This reactor closes that gap by observing reality: when a turn other than the
 * plan's own proposal turn completes with a real, non-empty checkpoint diff, the
 * plan has been implemented and is marked so.
 *
 * @module ProposedPlanImplementationReactor
 */
import * as Context from "effect/Context";
import type * as Effect from "effect/Effect";
import type * as Scope from "effect/Scope";

/**
 * ProposedPlanImplementationReactorShape - Service API for the reactor lifecycle.
 */
export interface ProposedPlanImplementationReactorShape {
  /**
   * Start the reactor.
   *
   * The returned effect must be run in a scope so the worker fiber can be
   * finalized on shutdown. Consumes orchestration-domain events via an internal
   * queue.
   */
  readonly start: () => Effect.Effect<void, never, Scope.Scope>;

  /**
   * Resolves when the internal processing queue is empty and idle. Intended for
   * test use to replace timing-sensitive sleeps.
   */
  readonly drain: Effect.Effect<void>;
}

/**
 * ProposedPlanImplementationReactor - Service tag for the reactor worker.
 */
export class ProposedPlanImplementationReactor extends Context.Service<
  ProposedPlanImplementationReactor,
  ProposedPlanImplementationReactorShape
>()("t3/orchestration/Services/ProposedPlanImplementationReactor") {}
