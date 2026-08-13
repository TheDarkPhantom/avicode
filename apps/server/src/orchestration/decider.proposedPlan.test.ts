import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
  type OrchestrationThread,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const CHANGED_AT = "2026-01-01T00:05:00.000Z";

function isReadonlyArray<T>(value: T | ReadonlyArray<T>): value is ReadonlyArray<T> {
  return Array.isArray(value);
}

function makeReadModel(
  overrides: Partial<OrchestrationThread["proposedPlans"][number]> = {},
): OrchestrationReadModel {
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      {
        id: ThreadId.make("thread-1"),
        projectId: ProjectId.make("project-1"),
        title: "Thread",
        modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
        runtimeMode: "full-access",
        interactionMode: "plan",
        branch: null,
        worktreePath: null,
        latestTurn: null,
        createdAt: NOW,
        updatedAt: NOW,
        archivedAt: null,
        settledOverride: null,
        settledAt: null,
        deletedAt: null,
        messages: [],
        proposedPlans: [
          {
            id: "plan-1",
            turnId: null,
            planMarkdown: "# Plan",
            implementedAt: null,
            implementationThreadId: null,
            discardedAt: null,
            createdAt: NOW,
            updatedAt: NOW,
            ...overrides,
          },
        ],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: NOW,
  };
}

it.layer(NodeServices.layer)("proposed plan decider", (it) => {
  it.effect("discards and restores a plan through durable upsert events", () =>
    Effect.gen(function* () {
      const discarded = yield* decideOrchestrationCommand({
        command: {
          type: "thread.proposed-plan.discard",
          commandId: CommandId.make("cmd-discard"),
          threadId: ThreadId.make("thread-1"),
          planId: "plan-1",
          createdAt: CHANGED_AT,
        },
        readModel: makeReadModel(),
      });
      expect(isReadonlyArray(discarded)).toBe(false);
      expect(discarded).toMatchObject({
        type: "thread.proposed-plan-upserted",
        payload: {
          proposedPlan: { discardedAt: CHANGED_AT, updatedAt: CHANGED_AT },
        },
      });

      const restored = yield* decideOrchestrationCommand({
        command: {
          type: "thread.proposed-plan.restore",
          commandId: CommandId.make("cmd-restore"),
          threadId: ThreadId.make("thread-1"),
          planId: "plan-1",
          createdAt: CHANGED_AT,
        },
        readModel: makeReadModel({ discardedAt: NOW }),
      });
      expect(restored).toMatchObject({
        type: "thread.proposed-plan-upserted",
        payload: { proposedPlan: { discardedAt: null } },
      });
    }),
  );

  it.effect("rejects discard for an implemented plan", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.proposed-plan.discard",
          commandId: CommandId.make("cmd-discard-built"),
          threadId: ThreadId.make("thread-1"),
          planId: "plan-1",
          createdAt: CHANGED_AT,
        },
        readModel: makeReadModel({ implementedAt: NOW }),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );

  it.effect("rejects implementation start from a discarded plan", () =>
    Effect.gen(function* () {
      const error = yield* decideOrchestrationCommand({
        command: {
          type: "thread.turn.start",
          commandId: CommandId.make("cmd-implement-discarded"),
          threadId: ThreadId.make("thread-1"),
          message: {
            messageId: MessageId.make("message-1"),
            role: "user",
            text: "Implement plan",
            attachments: [],
          },
          runtimeMode: "full-access",
          interactionMode: "default",
          sourceProposedPlan: { threadId: ThreadId.make("thread-1"), planId: "plan-1" },
          createdAt: CHANGED_AT,
        },
        readModel: makeReadModel({ discardedAt: NOW }),
      }).pipe(Effect.flip);
      expect(error._tag).toBe("OrchestrationCommandInvariantError");
    }),
  );
});
