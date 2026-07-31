import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";

function makeReadModel(): OrchestrationReadModel {
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
        interactionMode: "default",
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
        proposedPlans: [],
        activities: [],
        checkpoints: [],
        session: null,
      },
    ],
    updatedAt: NOW,
  };
}

function startTurn(communicationStyle?: { label: string; instruction: string }) {
  return decideOrchestrationCommand({
    command: {
      type: "thread.turn.start",
      commandId: CommandId.make("cmd-turn"),
      threadId: ThreadId.make("thread-1"),
      message: {
        messageId: MessageId.make("message-1"),
        role: "user",
        text: "Explain the projector.",
        attachments: [],
      },
      runtimeMode: "full-access",
      interactionMode: "default",
      ...(communicationStyle ? { communicationStyle } : {}),
      createdAt: NOW,
    },
    readModel: makeReadModel(),
  });
}

it.layer(NodeServices.layer)("communication style decider", (it) => {
  it.effect("splits the style across two events: label persisted, instruction not", () =>
    Effect.gen(function* () {
      const result = yield* startTurn({ label: "Caveman", instruction: "Talk like caveman." });
      const events = Array.isArray(result) ? result : [result];

      const messageEvent = events.find((event) => event.type === "thread.message-sent");
      const turnEvent = events.find((event) => event.type === "thread.turn-start-requested");

      // The message keeps only the label, so the timeline can show a chip
      // without the instruction ever entering the transcript.
      expect(messageEvent?.type).toBe("thread.message-sent");
      if (messageEvent?.type === "thread.message-sent") {
        expect(messageEvent.payload.communicationStyle).toBe("Caveman");
        expect(messageEvent.payload.text).toBe("Explain the projector.");
        expect(JSON.stringify(messageEvent.payload)).not.toContain("Talk like caveman.");
      }

      // The turn carries the instruction, which is what the reactor splices
      // into the provider-bound text.
      expect(turnEvent?.type).toBe("thread.turn-start-requested");
      if (turnEvent?.type === "thread.turn-start-requested") {
        expect(turnEvent.payload.communicationStyle).toEqual({
          label: "Caveman",
          instruction: "Talk like caveman.",
        });
      }
    }),
  );

  it.effect("records nothing when no style is sent", () =>
    Effect.gen(function* () {
      const result = yield* startTurn();
      const events = Array.isArray(result) ? result : [result];

      const messageEvent = events.find((event) => event.type === "thread.message-sent");
      const turnEvent = events.find((event) => event.type === "thread.turn-start-requested");
      if (messageEvent?.type === "thread.message-sent") {
        expect(messageEvent.payload.communicationStyle).toBeUndefined();
      }
      if (turnEvent?.type === "thread.turn-start-requested") {
        expect(turnEvent.payload.communicationStyle).toBeUndefined();
      }
    }),
  );

  it.effect("treats a blank instruction as the default style", () =>
    Effect.gen(function* () {
      // The client may send its current selection unconditionally; a style with
      // nothing to say must not put a meaningless chip on the turn.
      const result = yield* startTurn({ label: "Default", instruction: "   " });
      const events = Array.isArray(result) ? result : [result];

      const messageEvent = events.find((event) => event.type === "thread.message-sent");
      const turnEvent = events.find((event) => event.type === "thread.turn-start-requested");
      if (messageEvent?.type === "thread.message-sent") {
        expect(messageEvent.payload.communicationStyle).toBeUndefined();
      }
      if (turnEvent?.type === "thread.turn-start-requested") {
        expect(turnEvent.payload.communicationStyle).toBeUndefined();
      }
    }),
  );
});
