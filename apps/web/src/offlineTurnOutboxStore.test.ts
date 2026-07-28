import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import * as Cause from "effect/Cause";
import { AsyncResult } from "effect/unstable/reactivity";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { dispatchQueuedTurnCommands } from "./components/OfflineTurnOutboxFlusher";
import { createMemoryStorage, type StateStorage } from "./lib/storage";
import {
  configureOfflineTurnOutboxStorageForTest,
  OFFLINE_TURN_OUTBOX_STORAGE_KEY,
  queuedTurnChatMessage,
  useOfflineTurnOutboxStore,
  writeOfflineTurnOutboxStorageForTest,
  type QueuedTurnOutboxItem,
} from "./offlineTurnOutboxStore";

const environmentId = EnvironmentId.make("environment-outbox");
const threadId = ThreadId.make("thread-outbox");
const messageId = MessageId.make("message-outbox");
const commandId = CommandId.make("command-outbox");
let storage: StateStorage;

function queuedItem(overrides?: Partial<QueuedTurnOutboxItem>): QueuedTurnOutboxItem {
  const modelSelection = createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.6", []);
  return {
    id: commandId,
    environmentId,
    threadId,
    messageId,
    createdAt: "2026-07-29T10:00:00.000Z",
    commands: [
      {
        type: "thread.turn.start",
        commandId,
        threadId,
        message: {
          messageId,
          role: "user",
          text: "queued prompt",
          attachments: [
            {
              type: "image",
              name: "screen.png",
              mimeType: "image/png",
              sizeBytes: 12,
              dataUrl: "data:image/png;base64,AAAA",
            },
          ],
        },
        modelSelection,
        titleSeed: "Queued prompt",
        runtimeMode: "full-access",
        interactionMode: "default",
        bootstrap: {
          createThread: {
            projectId: ProjectId.make("project-outbox"),
            title: "Queued prompt",
            modelSelection,
            runtimeMode: "full-access",
            interactionMode: "default",
            branch: null,
            worktreePath: null,
            createdAt: "2026-07-29T10:00:00.000Z",
          },
        },
        createdAt: "2026-07-29T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  storage = createMemoryStorage();
  configureOfflineTurnOutboxStorageForTest(storage);
  writeOfflineTurnOutboxStorageForTest("");
});

describe("offlineTurnOutboxStore", () => {
  it("durably queues one turn per environment thread", () => {
    expect(useOfflineTurnOutboxStore.getState().enqueue(queuedItem())).toEqual({ queued: true });
    expect(useOfflineTurnOutboxStore.getState().items).toHaveLength(1);
    expect(storage.getItem(OFFLINE_TURN_OUTBOX_STORAGE_KEY)).toContain(commandId);

    expect(
      useOfflineTurnOutboxStore.getState().enqueue(
        queuedItem({
          id: CommandId.make("command-outbox-2"),
          messageId: MessageId.make("message-outbox-2"),
        }),
      ),
    ).toEqual({ queued: false, reason: "already-queued" });
  });

  it("hydrates valid commands and rejects malformed storage", async () => {
    useOfflineTurnOutboxStore.getState().enqueue(queuedItem());
    const persisted = await storage.getItem(OFFLINE_TURN_OUTBOX_STORAGE_KEY);
    expect(persisted).not.toBeNull();
    writeOfflineTurnOutboxStorageForTest(persisted!);
    expect(useOfflineTurnOutboxStore.getState().items[0]?.id).toBe(commandId);

    writeOfflineTurnOutboxStorageForTest('{"version":1,"state":{"items":[{"bad":true}]}}');
    expect(useOfflineTurnOutboxStore.getState().items).toEqual([]);
  });

  it("reconstructs the optimistic message from the durable command", () => {
    expect(queuedTurnChatMessage(queuedItem())).toMatchObject({
      id: messageId,
      role: "user",
      text: "queued prompt",
      attachments: [{ type: "image", previewUrl: "data:image/png;base64,AAAA" }],
    });
  });

  it("removes delivered items from memory and storage", () => {
    useOfflineTurnOutboxStore.getState().enqueue(queuedItem());
    useOfflineTurnOutboxStore.getState().remove(commandId);
    expect(useOfflineTurnOutboxStore.getState().items).toEqual([]);
    expect(storage.getItem(OFFLINE_TURN_OUTBOX_STORAGE_KEY)).toContain('"items":[]');
  });

  it("dispatches in order and stops on the first failure", async () => {
    const item = queuedItem({
      commands: [
        {
          type: "thread.meta.update",
          commandId: CommandId.make("command-metadata"),
          threadId,
          title: "Queued prompt",
        },
        ...queuedItem().commands,
      ],
    });
    const dispatched: string[] = [];
    const result = await dispatchQueuedTurnCommands(item, async (_environmentId, command) => {
      dispatched.push(command.commandId);
      return command.type === "thread.turn.start"
        ? AsyncResult.failure(Cause.fail(new Error("transport closed")))
        : AsyncResult.success(undefined);
    });
    expect(dispatched).toEqual(["command-metadata", commandId]);
    expect(result?._tag).toBe("Failure");
  });
});
