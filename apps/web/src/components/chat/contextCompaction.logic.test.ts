import { EventId, MessageId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import type { ChatMessage, Thread } from "../../types";
import {
  deriveCompactDisabledReason,
  deriveIsCompacting,
  isCompactCommandMessage,
  latestTurnStartFailureId,
} from "./contextCompaction.logic";

function userMessage(id: string, text: string, createdAt: string): ChatMessage {
  return {
    id: MessageId.make(id),
    role: "user",
    text,
    turnId: null,
    createdAt,
    updatedAt: createdAt,
    streaming: false,
  };
}

function activity(id: string, kind: string, payload: unknown): Thread["activities"][number] {
  return {
    id: EventId.make(id),
    tone: kind === "provider.turn.start.failed" ? "error" : "info",
    kind,
    summary: kind,
    payload,
    turnId: null,
    createdAt: "2026-09-30T10:05:00.000Z",
  };
}

const earlier = userMessage("m1", "Refactor the parser", "2026-09-30T09:00:00.000Z");
const compact = userMessage("m2", "/compact", "2026-09-30T10:00:00.000Z");
const settledTurn = {
  requestedAt: "2026-09-30T09:00:00.000Z",
  state: "completed" as const,
};

describe("isCompactCommandMessage", () => {
  it("matches a bare /compact from the user", () => {
    expect(isCompactCommandMessage(compact)).toBe(true);
    expect(isCompactCommandMessage({ ...compact, text: "  /COMPACT " })).toBe(true);
  });

  it("ignores prompts that mention /compact or carry attachments", () => {
    expect(isCompactCommandMessage({ ...compact, text: "/compact now please" })).toBe(false);
    expect(isCompactCommandMessage({ ...compact, role: "assistant" })).toBe(false);
    expect(isCompactCommandMessage({ ...compact, attachments: [{}] })).toBe(false);
  });
});

describe("latestTurnStartFailureId", () => {
  it("finds the newest failure for the message", () => {
    const thread = {
      activities: [
        activity("f1", "provider.turn.start.failed", { requestId: "m2" }),
        activity("f2", "provider.turn.start.failed", { requestId: "other" }),
        activity("f3", "provider.turn.start.failed", { requestId: "m2" }),
      ],
    };
    expect(latestTurnStartFailureId(thread, compact.id)).toBe("f3");
    expect(latestTurnStartFailureId(thread, null)).toBeNull();
  });
});

describe("deriveIsCompacting", () => {
  const base = {
    isSendBusy: false,
    phase: "connecting" as const,
    optimisticUserMessages: [],
    latestTurn: settledTurn,
  };

  it("is compacting while the session restarts after a /compact", () => {
    expect(
      deriveIsCompacting({
        ...base,
        activeThread: { messages: [earlier, compact], activities: [] },
      }),
    ).toBe(true);
  });

  it("tracks the optimistic message while the send is in flight", () => {
    expect(
      deriveIsCompacting({
        ...base,
        isSendBusy: true,
        phase: "ready",
        optimisticUserMessages: [compact],
        activeThread: { messages: [earlier], activities: [] },
      }),
    ).toBe(true);
  });

  it("settles on the compaction activity or a failure naming the request", () => {
    for (const settledBy of [
      activity("c1", "context-compaction", { state: "compacted", requestId: "m2" }),
      activity("f1", "provider.turn.start.failed", { requestId: "m2" }),
    ]) {
      expect(
        deriveIsCompacting({
          ...base,
          activeThread: { messages: [earlier, compact], activities: [settledBy] },
        }),
      ).toBe(false);
    }
  });

  it("is idle once the session is ready or a later turn started", () => {
    expect(
      deriveIsCompacting({
        ...base,
        phase: "ready",
        activeThread: { messages: [earlier, compact], activities: [] },
      }),
    ).toBe(false);
    expect(
      deriveIsCompacting({
        ...base,
        phase: "running",
        latestTurn: { requestedAt: "2026-09-30T11:00:00.000Z", state: "running" },
        activeThread: { messages: [earlier, compact], activities: [] },
      }),
    ).toBe(false);
  });

  it("ignores threads that never asked to compact", () => {
    expect(
      deriveIsCompacting({ ...base, activeThread: { messages: [earlier], activities: [] } }),
    ).toBe(false);
  });

  it("accepts a turn the server opened for the compaction itself", () => {
    expect(
      deriveIsCompacting({
        ...base,
        phase: "running",
        latestTurn: { requestedAt: compact.createdAt, state: "running" },
        activeThread: { messages: [earlier, compact], activities: [] },
      }),
    ).toBe(true);
  });
});

describe("deriveCompactDisabledReason", () => {
  const available = {
    unavailable: true,
    hasProject: true,
    providerSupportsCompaction: true,
    hasConversation: true,
  };

  it("is null while compaction is available", () => {
    expect(deriveCompactDisabledReason({ ...available, unavailable: false })).toBeNull();
  });

  it("names the first blocker", () => {
    expect(deriveCompactDisabledReason({ ...available, hasProject: false })).toBe(
      "Choose a project before compacting",
    );
    expect(deriveCompactDisabledReason({ ...available, providerSupportsCompaction: false })).toBe(
      "Compaction is unavailable for this provider",
    );
    expect(deriveCompactDisabledReason({ ...available, hasConversation: false })).toBe(
      "Nothing to compact yet",
    );
    expect(deriveCompactDisabledReason(available)).toBe("Compacting is unavailable right now");
  });
});
