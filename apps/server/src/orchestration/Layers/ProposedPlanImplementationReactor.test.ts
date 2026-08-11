import {
  CheckpointRef,
  CommandId,
  DEFAULT_PROVIDER_INTERACTION_MODE,
  type OrchestrationEvent,
  OrchestrationProposedPlanId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Stream from "effect/Stream";

import { OrchestrationCommandReceiptRepositoryLive } from "../../persistence/Layers/OrchestrationCommandReceipts.ts";
import { OrchestrationEventStoreLive } from "../../persistence/Layers/OrchestrationEventStore.ts";
import { SqlitePersistenceMemory } from "../../persistence/Layers/Sqlite.ts";
import * as RepositoryIdentityResolver from "../../project/RepositoryIdentityResolver.ts";
import { ServerConfig } from "../../config.ts";
import { OrchestrationEngineLive } from "./OrchestrationEngine.ts";
import { OrchestrationProjectionPipelineLive } from "./ProjectionPipeline.ts";
import { OrchestrationProjectionSnapshotQueryLive } from "./ProjectionSnapshotQuery.ts";
import { ProposedPlanImplementationReactorLive } from "./ProposedPlanImplementationReactor.ts";
import { OrchestrationEngineService } from "../Services/OrchestrationEngine.ts";
import { ProposedPlanImplementationReactor } from "../Services/ProposedPlanImplementationReactor.ts";

// The reactor's own branching (empty diffs, own-proposal-turn guard,
// already-implemented, plan selection) is covered exhaustively by the pure
// `selectPlanToMarkImplemented` / `diffEventMarksImplementation` unit tests.
// This suite proves only the end-to-end wiring: a real turn-diff event flows
// engine -> domain stream -> reactor -> upsert -> projection.

const THREAD_ID = ThreadId.make("thread-1");
const PLAN_TURN_ID = TurnId.make("turn-plan");
const BUILD_TURN_ID = TurnId.make("turn-build");
const PLAN_ID = OrchestrationProposedPlanId.make("plan-1");
const CREATED_AT = "2026-01-01T00:00:00.000Z";
const DIFF_AT = "2026-01-01T00:10:00.000Z";

const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5-codex",
};

const TestLayer = ProposedPlanImplementationReactorLive.pipe(
  Layer.provideMerge(
    Layer.mergeAll(
      OrchestrationEngineLive.pipe(
        Layer.provide(OrchestrationProjectionSnapshotQueryLive),
        Layer.provide(OrchestrationProjectionPipelineLive),
      ),
      OrchestrationProjectionSnapshotQueryLive,
    ).pipe(
      Layer.provide(OrchestrationEventStoreLive),
      Layer.provide(OrchestrationCommandReceiptRepositoryLive),
      Layer.provide(RepositoryIdentityResolver.layer),
      Layer.provide(SqlitePersistenceMemory),
      Layer.provideMerge(ServerConfig.layerTest(process.cwd(), process.cwd())),
      Layer.provideMerge(NodeServices.layer),
    ),
  ),
);

const isPlanImplementedEvent = (
  event: OrchestrationEvent,
): event is Extract<OrchestrationEvent, { type: "thread.proposed-plan-upserted" }> =>
  event.type === "thread.proposed-plan-upserted" &&
  event.payload.threadId === THREAD_ID &&
  event.payload.proposedPlan.id === PLAN_ID &&
  event.payload.proposedPlan.implementedAt !== null;

describe("ProposedPlanImplementationReactor", () => {
  it.effect("marks the plan implemented when a later turn completes with real changes", () =>
    Effect.scoped(
      Effect.gen(function* () {
        const engine = yield* OrchestrationEngineService;
        const reactor = yield* ProposedPlanImplementationReactor;
        yield* reactor.start();

        // Watch for the implementing upsert as a receipt. Forked before the
        // seeds so the subscription is live by the time the diff is dispatched;
        // the seed upsert (implementedAt: null) is filtered out.
        const implementedFiber = yield* engine.streamDomainEvents.pipe(
          Stream.filter(isPlanImplementedEvent),
          Stream.runHead,
          Effect.forkScoped,
        );

        yield* engine.dispatch({
          type: "project.create",
          commandId: CommandId.make("cmd-project-create"),
          projectId: ProjectId.make("project-1"),
          title: "Project",
          workspaceRoot: process.cwd(),
          defaultModelSelection: modelSelection,
          createdAt: CREATED_AT,
        });
        yield* engine.dispatch({
          type: "thread.create",
          commandId: CommandId.make("cmd-thread-create"),
          threadId: THREAD_ID,
          projectId: ProjectId.make("project-1"),
          title: "Thread",
          modelSelection,
          interactionMode: DEFAULT_PROVIDER_INTERACTION_MODE,
          runtimeMode: "approval-required",
          branch: null,
          worktreePath: null,
          createdAt: CREATED_AT,
        });
        yield* engine.dispatch({
          type: "thread.proposed-plan.upsert",
          commandId: CommandId.make("cmd-plan-seed"),
          threadId: THREAD_ID,
          proposedPlan: {
            id: PLAN_ID,
            turnId: PLAN_TURN_ID,
            planMarkdown: "# Plan\n\nBody",
            implementedAt: null,
            implementationThreadId: null,
            createdAt: CREATED_AT,
            updatedAt: CREATED_AT,
          },
          createdAt: CREATED_AT,
        });

        yield* engine.dispatch({
          type: "thread.turn.diff.complete",
          commandId: CommandId.make("cmd-diff-build"),
          threadId: THREAD_ID,
          turnId: BUILD_TURN_ID,
          completedAt: DIFF_AT,
          checkpointRef: CheckpointRef.make("refs/t3/checkpoints/thread-1/turn/build"),
          status: "ready",
          files: [
            { path: "src/file-0.ts", kind: "modified", additions: 3, deletions: 1 },
            { path: "src/file-1.ts", kind: "modified", additions: 1, deletions: 0 },
          ],
          checkpointTurnCount: 1,
          createdAt: DIFF_AT,
        });

        const observed = yield* Fiber.join(implementedFiber).pipe(Effect.timeout("10 seconds"));
        expect(Option.isSome(observed)).toBe(true);
        const implemented = Option.getOrThrow(observed);
        expect(implemented.payload.proposedPlan.implementedAt).toBe(DIFF_AT);
        expect(implemented.payload.proposedPlan.implementationThreadId).toBe(THREAD_ID);
      }).pipe(Effect.provide(TestLayer)),
    ),
  );
});
