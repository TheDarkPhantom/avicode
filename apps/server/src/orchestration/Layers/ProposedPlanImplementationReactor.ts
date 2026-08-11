/**
 * ProposedPlanImplementationReactor - see the service module for rationale.
 *
 * Avi Code addition.
 *
 * @module ProposedPlanImplementationReactor
 */
import { CommandId, type OrchestrationEvent, type ThreadId } from "@t3tools/contracts";
import * as Cause from "effect/Cause";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";
import { makeDrainableWorker } from "@t3tools/shared/DrainableWorker";

import {
  ProposedPlanImplementationReactor,
  type ProposedPlanImplementationReactorShape,
} from "../Services/ProposedPlanImplementationReactor.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProjectionSnapshotQuery } from "../Services/ProjectionSnapshotQuery.ts";
import {
  diffEventMarksImplementation,
  selectPlanToMarkImplemented,
} from "../proposedPlanImplementation.ts";

const make = Effect.gen(function* () {
  const crypto = yield* Crypto.Crypto;
  const orchestrationEngine = yield* OrchestrationEngineService;
  const projectionSnapshotQuery = yield* ProjectionSnapshotQuery;

  const resolveThreadDetail = Effect.fn("resolveThreadDetail")(function* (threadId: ThreadId) {
    return yield* projectionSnapshotQuery
      .getThreadDetailById(threadId)
      .pipe(Effect.map(Option.getOrUndefined));
  });

  const markLatestActionablePlanImplemented = Effect.fn("markLatestActionablePlanImplemented")(
    function* (input: {
      readonly threadId: ThreadId;
      readonly changeTurnId: string;
      readonly implementedAt: string;
    }) {
      const thread = yield* resolveThreadDetail(input.threadId);
      if (!thread) {
        return;
      }
      const plan = selectPlanToMarkImplemented(thread.proposedPlans, input.changeTurnId);
      if (!plan) {
        return;
      }

      const commandUuid = yield* crypto.randomUUIDv4;
      yield* orchestrationEngine.dispatch({
        type: "thread.proposed-plan.upsert",
        commandId: CommandId.make(`plan-implemented-by-changes:${thread.id}:${commandUuid}`),
        threadId: thread.id,
        proposedPlan: {
          ...plan,
          implementedAt: input.implementedAt,
          implementationThreadId: thread.id,
          updatedAt: input.implementedAt,
        },
        createdAt: input.implementedAt,
      });
    },
  );

  const processDomainEvent = Effect.fn("processDomainEvent")(function* (event: OrchestrationEvent) {
    if (event.type !== "thread.turn-diff-completed") {
      return;
    }
    if (
      !diffEventMarksImplementation({
        status: event.payload.status,
        fileCount: event.payload.files.length,
      })
    ) {
      return;
    }
    yield* markLatestActionablePlanImplemented({
      threadId: event.payload.threadId,
      changeTurnId: event.payload.turnId,
      implementedAt: event.payload.completedAt,
    });
  });

  const processDomainEventSafely = (event: OrchestrationEvent) =>
    processDomainEvent(event).pipe(
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.logWarning("proposed plan implementation reactor failed to process event", {
              eventType: event.type,
              cause: Cause.pretty(cause),
            }),
      ),
    );

  const worker = yield* makeDrainableWorker(processDomainEventSafely);

  const start: ProposedPlanImplementationReactorShape["start"] = Effect.fn("start")(function* () {
    yield* Effect.forkScoped(
      Stream.runForEach(orchestrationEngine.streamDomainEvents, (event) => {
        if (event.type !== "thread.turn-diff-completed") {
          return Effect.void;
        }
        return worker.enqueue(event);
      }),
    );
  });

  return {
    start,
    drain: worker.drain,
  } satisfies ProposedPlanImplementationReactorShape;
});

export const ProposedPlanImplementationReactorLive = Layer.effect(
  ProposedPlanImplementationReactor,
  make,
);
