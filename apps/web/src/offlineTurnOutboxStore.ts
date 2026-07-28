import {
  ClientOrchestrationCommand,
  CommandId,
  EnvironmentId,
  MessageId,
  ThreadId,
  type ChatAttachment,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";

import { createMemoryStorage, type StateStorage } from "./lib/storage";
import type { ChatMessage } from "./types";

export const OFFLINE_TURN_OUTBOX_STORAGE_KEY = "t3code:offline-turn-outbox:v1";
const OFFLINE_TURN_OUTBOX_STORAGE_VERSION = 1;

export const QueuedTurnOutboxItem = Schema.Struct({
  id: CommandId,
  environmentId: EnvironmentId,
  threadId: ThreadId,
  messageId: MessageId,
  createdAt: Schema.String,
  commands: Schema.Array(ClientOrchestrationCommand),
});
export type QueuedTurnOutboxItem = typeof QueuedTurnOutboxItem.Type;

const PersistedOfflineTurnOutboxState = Schema.Struct({
  items: Schema.Array(QueuedTurnOutboxItem),
});
const decodePersistedState = Schema.decodeUnknownSync(PersistedOfflineTurnOutboxState);

function resolveBaseStorage(): { storage: StateStorage; durable: boolean } {
  try {
    if (typeof localStorage !== "undefined") {
      return { storage: localStorage, durable: true };
    }
  } catch {
    // Fall through to memory when browser storage is unavailable.
  }
  return { storage: createMemoryStorage(), durable: false };
}

const resolvedBaseStorage = resolveBaseStorage();
let baseStorage = resolvedBaseStorage.storage;
let storageIsDurable = resolvedBaseStorage.durable;

function persistItems(items: ReadonlyArray<QueuedTurnOutboxItem>): {
  written: boolean;
  durable: boolean;
} {
  try {
    baseStorage.setItem(
      OFFLINE_TURN_OUTBOX_STORAGE_KEY,
      JSON.stringify({
        version: OFFLINE_TURN_OUTBOX_STORAGE_VERSION,
        state: { items },
      }),
    );
    return { written: true, durable: storageIsDurable };
  } catch (error) {
    console.error("[OFFLINE-TURN-OUTBOX] Could not persist queued turn.", error);
    return { written: false, durable: false };
  }
}

function readPersistedItems(): ReadonlyArray<QueuedTurnOutboxItem> {
  try {
    const raw = baseStorage.getItem(OFFLINE_TURN_OUTBOX_STORAGE_KEY);
    if (typeof raw !== "string" || raw.length === 0) return [];
    const state = (JSON.parse(raw) as { state?: unknown } | null)?.state;
    return state ? decodePersistedState(state).items : [];
  } catch {
    return [];
  }
}

interface OfflineTurnOutboxState {
  readonly items: ReadonlyArray<QueuedTurnOutboxItem>;
  readonly failuresById: Readonly<Record<string, string>>;
  enqueue: (
    item: QueuedTurnOutboxItem,
  ) =>
    | { readonly queued: true }
    | { readonly queued: false; readonly reason: "already-queued" | "storage-unavailable" };
  remove: (itemId: CommandId) => void;
  setFailure: (itemId: CommandId, message: string | null) => void;
}

export const useOfflineTurnOutboxStore = create<OfflineTurnOutboxState>()((set, get) => ({
  items: readPersistedItems(),
  failuresById: {},
  enqueue: (item) => {
    const current = get().items;
    if (
      current.some(
        (candidate) =>
          candidate.environmentId === item.environmentId && candidate.threadId === item.threadId,
      )
    ) {
      return { queued: false, reason: "already-queued" };
    }
    const next = [...current, item];
    const persisted = persistItems(next);
    if (!persisted.written || !persisted.durable) {
      return { queued: false, reason: "storage-unavailable" };
    }
    set({ items: next });
    return { queued: true };
  },
  remove: (itemId) => {
    const current = get().items;
    const next = current.filter((item) => item.id !== itemId);
    if (next.length === current.length) return;
    persistItems(next);
    set((state) => {
      const failuresById = { ...state.failuresById };
      delete failuresById[itemId];
      return { items: next, failuresById };
    });
  },
  setFailure: (itemId, message) => {
    set((state) => {
      const failuresById = { ...state.failuresById };
      if (message === null) delete failuresById[itemId];
      else failuresById[itemId] = message;
      return { failuresById };
    });
  },
}));

export function queuedTurnStartCommand(
  item: QueuedTurnOutboxItem,
): Extract<ClientOrchestrationCommand, { readonly type: "thread.turn.start" }> | null {
  return (
    item.commands.find(
      (
        command,
      ): command is Extract<ClientOrchestrationCommand, { readonly type: "thread.turn.start" }> =>
        command.type === "thread.turn.start",
    ) ?? null
  );
}

function queuedDisplayAttachments(
  messageId: MessageId,
  attachments: Extract<
    ClientOrchestrationCommand,
    { readonly type: "thread.turn.start" }
  >["message"]["attachments"],
): ChatAttachment[] {
  return attachments.map((attachment, index) =>
    attachment.type === "image"
      ? {
          type: "image",
          id: `queued-${messageId}-${index}`,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          previewUrl: attachment.dataUrl,
        }
      : {
          type: "document",
          id: `queued-${messageId}-${index}`,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          extractedChars: attachment.extractedText.length,
        },
  );
}

export function queuedTurnChatMessage(item: QueuedTurnOutboxItem): ChatMessage | null {
  const startCommand = queuedTurnStartCommand(item);
  if (!startCommand) return null;
  const attachments = queuedDisplayAttachments(item.messageId, startCommand.message.attachments);
  return {
    id: item.messageId,
    role: "user",
    text: startCommand.message.text,
    ...(attachments.length > 0 ? { attachments } : {}),
    turnId: null,
    createdAt: item.createdAt,
    updatedAt: item.createdAt,
    streaming: false,
  };
}

export function writeOfflineTurnOutboxStorageForTest(raw: string): void {
  baseStorage.setItem(OFFLINE_TURN_OUTBOX_STORAGE_KEY, raw);
  useOfflineTurnOutboxStore.setState({ items: readPersistedItems(), failuresById: {} });
}

export function configureOfflineTurnOutboxStorageForTest(
  storage: StateStorage,
  durable = true,
): void {
  baseStorage = storage;
  storageIsDurable = durable;
  useOfflineTurnOutboxStore.setState({ items: readPersistedItems(), failuresById: {} });
}
