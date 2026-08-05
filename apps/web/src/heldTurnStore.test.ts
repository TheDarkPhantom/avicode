import {
  CommandId,
  EnvironmentId,
  MessageId,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import { createModelSelection } from "@t3tools/shared/model";
import { beforeEach, describe, expect, it } from "vite-plus/test";

import { createEmptyThreadDraft } from "./composerDraftStore";
import {
  findHeldTurnForThread,
  resetHeldTurnStoreForTest,
  useHeldTurnStore,
  type HeldTurnItem,
} from "./heldTurnStore";
import { queuedTurnChatMessage } from "./offlineTurnOutboxStore";

const environmentId = EnvironmentId.make("environment-held");
const threadId = ThreadId.make("thread-held");
const messageId = MessageId.make("message-held");
const commandId = CommandId.make("command-held");
const threadKey = "environment-held:thread-held";

function heldItem(overrides?: Partial<HeldTurnItem>): HeldTurnItem {
  return {
    id: commandId,
    environmentId,
    threadId,
    messageId,
    createdAt: "2026-08-04T10:00:00.000Z",
    threadKey,
    draft: { ...createEmptyThreadDraft(), prompt: "the sentence as it was written" },
    commands: [
      {
        type: "thread.turn.start",
        commandId,
        threadId,
        message: {
          messageId,
          role: "user",
          text: "the sentence as it was written",
          attachments: [],
        },
        modelSelection: createModelSelection(ProviderInstanceId.make("codex"), "gpt-5.6", []),
        titleSeed: "The sentence",
        runtimeMode: "full-access",
        interactionMode: "default",
        createdAt: "2026-08-04T10:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  resetHeldTurnStoreForTest();
});

describe("heldTurnStore", () => {
  it("holds one turn per thread", () => {
    expect(useHeldTurnStore.getState().enqueue(heldItem())).toEqual({ queued: true });
    expect(useHeldTurnStore.getState().items).toHaveLength(1);

    expect(
      useHeldTurnStore.getState().enqueue(
        heldItem({
          id: CommandId.make("command-held-2"),
          messageId: MessageId.make("message-held-2"),
        }),
      ),
    ).toEqual({ queued: false, reason: "already-queued" });
    expect(useHeldTurnStore.getState().items).toHaveLength(1);
  });

  it("keeps a second thread's hold separate", () => {
    useHeldTurnStore.getState().enqueue(heldItem());
    expect(
      useHeldTurnStore.getState().enqueue(
        heldItem({
          id: CommandId.make("command-held-other"),
          threadKey: "environment-held:thread-other",
        }),
      ),
    ).toEqual({ queued: true });
    expect(findHeldTurnForThread(useHeldTurnStore.getState().items, threadKey)?.id).toBe(commandId);
    expect(
      findHeldTurnForThread(useHeldTurnStore.getState().items, "environment-held:thread-other")?.id,
    ).toBe("command-held-other");
    expect(findHeldTurnForThread(useHeldTurnStore.getState().items, null)).toBeNull();
    expect(
      findHeldTurnForThread(useHeldTurnStore.getState().items, "environment-held:absent"),
    ).toBe(null);
  });

  it("carries the draft back so cancelling returns what was written", () => {
    useHeldTurnStore.getState().enqueue(heldItem());
    const held = findHeldTurnForThread(useHeldTurnStore.getState().items, threadKey);
    expect(held?.draft.prompt).toBe("the sentence as it was written");
  });

  it("renders the same pending row an offline queued turn does", () => {
    expect(queuedTurnChatMessage(heldItem())).toMatchObject({
      id: messageId,
      role: "user",
      text: "the sentence as it was written",
    });
  });

  it("keeps a failed hold so it can be retried, and drops its failure on removal", () => {
    useHeldTurnStore.getState().enqueue(heldItem());
    useHeldTurnStore.getState().setFailure(commandId, "transport closed");
    expect(useHeldTurnStore.getState().failuresById[commandId]).toBe("transport closed");
    expect(useHeldTurnStore.getState().items).toHaveLength(1);

    useHeldTurnStore.getState().remove(commandId);
    expect(useHeldTurnStore.getState().items).toEqual([]);
    expect(useHeldTurnStore.getState().failuresById[commandId]).toBeUndefined();
  });

  it("ignores a removal that matches nothing", () => {
    useHeldTurnStore.getState().enqueue(heldItem());
    const before = useHeldTurnStore.getState().items;
    useHeldTurnStore.getState().remove(CommandId.make("command-absent"));
    expect(useHeldTurnStore.getState().items).toBe(before);
  });
});
