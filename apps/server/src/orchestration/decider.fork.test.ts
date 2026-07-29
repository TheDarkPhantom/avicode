import {
  CommandId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationEvent,
  type OrchestrationMessage,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const NOW = "2026-01-01T00:00:00.000Z";
const SOURCE_THREAD = ThreadId.make("thread-source");
const FORK_THREAD = ThreadId.make("thread-fork");

function makeMessage(
  id: string,
  role: OrchestrationMessage["role"],
  createdAt: string,
): OrchestrationMessage {
  return {
    id: MessageId.make(id),
    role,
    text: `${role} ${id}`,
    turnId: null,
    streaming: false,
    createdAt,
    updatedAt: createdAt,
  };
}

// user-1 / assistant-1 / user-2 / assistant-2 — branching at user-2 should
// inherit exactly the first two and nothing after.
const MESSAGES: ReadonlyArray<OrchestrationMessage> = [
  makeMessage("user-1", "user", "2025-12-31T00:00:00.000Z"),
  makeMessage("assistant-1", "assistant", "2025-12-31T00:00:01.000Z"),
  makeMessage("user-2", "user", "2025-12-31T00:00:02.000Z"),
  makeMessage("assistant-2", "assistant", "2025-12-31T00:00:03.000Z"),
];

function makeReadModel(
  messages: ReadonlyArray<OrchestrationMessage> = MESSAGES,
  extraThreadIds: ReadonlyArray<ThreadId> = [],
): OrchestrationReadModel {
  const base = {
    projectId: ProjectId.make("project-1"),
    title: "Source thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    branch: "feature/branching",
    worktreePath: "/tmp/worktree",
    latestTurn: null,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: null,
    settledAt: null,
    deletedAt: null,
    proposedPlans: [],
    activities: [],
    checkpoints: [],
    session: null,
  };
  return {
    snapshotSequence: 0,
    projects: [],
    threads: [
      { ...base, id: SOURCE_THREAD, messages },
      ...extraThreadIds.map((id) => ({ ...base, id, messages: [] })),
    ],
    updatedAt: NOW,
  };
}

function forkCommand(overrides: { forkPointMessageId?: string; forkThreadId?: ThreadId } = {}) {
  return {
    type: "thread.fork" as const,
    commandId: CommandId.make("cmd-fork"),
    threadId: SOURCE_THREAD,
    forkThreadId: overrides.forkThreadId ?? FORK_THREAD,
    forkPointMessageId: MessageId.make(overrides.forkPointMessageId ?? "user-2"),
    message: {
      messageId: MessageId.make("message-edited"),
      role: "user" as const,
      text: "edited prompt",
      attachments: [],
    },
    runtimeMode: "full-access" as const,
    interactionMode: "default" as const,
    createdAt: NOW,
  };
}

// The decider returns either a single event or a list depending on the command;
// normalise so assertions can index uniformly.
function asArray(result: unknown): ReadonlyArray<OrchestrationEvent> {
  return (Array.isArray(result) ? result : [result]) as ReadonlyArray<OrchestrationEvent>;
}

it.layer(NodeServices.layer)("thread.fork decider", (it) => {
  it.effect("emits fork, edited user message, and turn start against the new thread", () =>
    Effect.gen(function* () {
      const events = asArray(
        yield* decideOrchestrationCommand({
          command: forkCommand(),
          readModel: makeReadModel(),
        }),
      );

      expect(events.map((event) => event.type)).toEqual([
        "thread.forked",
        "thread.message-sent",
        "thread.turn-start-requested",
      ]);

      // Every event belongs to the NEW thread; the source thread is untouched.
      for (const event of events) {
        expect(event.aggregateId).toBe(FORK_THREAD);
      }

      const [forked, messageSent, turnStart] = events;
      expect(forked?.payload).toMatchObject({
        threadId: FORK_THREAD,
        projectId: ProjectId.make("project-1"),
        forkedFrom: { threadId: SOURCE_THREAD, messageId: MessageId.make("user-2") },
        // Branching is conversation-only, so the branch shares the worktree.
        branch: "feature/branching",
        worktreePath: "/tmp/worktree",
      });

      expect(messageSent?.payload).toMatchObject({
        threadId: FORK_THREAD,
        messageId: MessageId.make("message-edited"),
        role: "user",
        text: "edited prompt",
        turnId: null,
      });

      expect(turnStart?.payload).toMatchObject({
        threadId: FORK_THREAD,
        messageId: MessageId.make("message-edited"),
      });

      // Causation chains fork -> message -> turn so replay order is pinned.
      expect(messageSent?.causationEventId).toBe(forked?.eventId);
      expect(turnStart?.causationEventId).toBe(messageSent?.eventId);
    }),
  );

  it.effect("inherits only the messages strictly before the fork point", () =>
    Effect.gen(function* () {
      const events = asArray(
        yield* decideOrchestrationCommand({
          command: forkCommand(),
          readModel: makeReadModel(),
        }),
      );
      const forked = events[0];
      expect((forked?.payload as { inheritedMessageIds: ReadonlyArray<string> }).inheritedMessageIds)
        .toEqual([MessageId.make("user-1"), MessageId.make("assistant-1")]);
    }),
  );

  it.effect("inherits nothing when branching at the very first message", () =>
    Effect.gen(function* () {
      const events = asArray(
        yield* decideOrchestrationCommand({
          command: forkCommand({ forkPointMessageId: "user-1" }),
          readModel: makeReadModel(),
        }),
      );
      expect((events[0]?.payload as { inheritedMessageIds: ReadonlyArray<string> }).inheritedMessageIds)
        .toEqual([]);
    }),
  );

  it.effect("rejects a fork point that is not a user message", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: forkCommand({ forkPointMessageId: "assistant-1" }),
        readModel: makeReadModel(),
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects a fork point that does not exist on the thread", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: forkCommand({ forkPointMessageId: "message-missing" }),
        readModel: makeReadModel(),
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }),
  );

  it.effect("rejects reusing an existing thread id as the fork target", () =>
    Effect.gen(function* () {
      const result = yield* decideOrchestrationCommand({
        command: forkCommand(),
        readModel: makeReadModel(MESSAGES, [FORK_THREAD]),
      }).pipe(Effect.result);
      expect(result._tag).toBe("Failure");
    }),
  );
});
