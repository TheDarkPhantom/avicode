import { MessageId, TurnId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";
import type { MessagesTimelineRow } from "./MessagesTimeline.logic";
import { findLastResponseRowIndex, resolveChatInitialScrollTarget } from "./openChatAtLastResponse";

const CREATED_AT = "2026-07-31T10:00:00.000Z";

function messageRow(id: string, role: "user" | "assistant"): MessagesTimelineRow {
  return {
    kind: "message",
    id: `entry-${id}`,
    createdAt: CREATED_AT,
    message: {
      id: MessageId.make(id),
      role,
      text: `${role} text`,
      turnId: TurnId.make("turn-1"),
      createdAt: CREATED_AT,
      updatedAt: CREATED_AT,
      streaming: false,
    },
    durationStart: CREATED_AT,
    showAssistantMeta: role === "assistant",
    showAssistantCopyButton: role === "assistant",
    assistantCopyStreaming: false,
  };
}

function workRow(id: string): MessagesTimelineRow {
  return { kind: "work", id, createdAt: CREATED_AT, groupedEntries: [] };
}

describe("findLastResponseRowIndex", () => {
  it("finds the newest assistant message", () => {
    const rows = [
      messageRow("u1", "user"),
      messageRow("a1", "assistant"),
      messageRow("u2", "user"),
      workRow("work-1"),
      messageRow("a2", "assistant"),
    ];

    expect(findLastResponseRowIndex(rows)).toBe(4);
  });

  it("skips the rows a finished turn leaves after its response", () => {
    const rows = [
      messageRow("u1", "user"),
      messageRow("a1", "assistant"),
      {
        kind: "work-toggle" as const,
        id: "toggle",
        createdAt: CREATED_AT,
        groupId: "group-1",
        hiddenCount: 3,
        expanded: false,
        onlyToolEntries: true,
      },
    ];

    expect(findLastResponseRowIndex(rows)).toBe(1);
  });

  it("returns null for a chat with no response yet", () => {
    expect(findLastResponseRowIndex([])).toBeNull();
    expect(findLastResponseRowIndex([messageRow("u1", "user"), workRow("work-1")])).toBeNull();
  });
});

describe("resolveChatInitialScrollTarget", () => {
  const rows = [messageRow("u1", "user"), messageRow("a1", "assistant")];

  it("waits for settings and thread hydration before deciding", () => {
    expect(
      resolveChatInitialScrollTarget({
        rows,
        enabled: true,
        settingsHydrated: false,
        lifecycle: "idle",
        topFadeEnabled: false,
      }),
    ).toEqual({ ready: false, target: null });
    expect(
      resolveChatInitialScrollTarget({
        rows,
        enabled: true,
        settingsHydrated: true,
        lifecycle: "loading",
        topFadeEnabled: false,
      }),
    ).toEqual({ ready: false, target: null });
  });

  it("never opens a running thread away from its live edge", () => {
    expect(
      resolveChatInitialScrollTarget({
        rows,
        enabled: true,
        settingsHydrated: true,
        lifecycle: "running",
        topFadeEnabled: true,
      }),
    ).toEqual({ ready: true, target: null });
  });

  it("opens a conclusively idle thread at its last response", () => {
    expect(
      resolveChatInitialScrollTarget({
        rows,
        enabled: true,
        settingsHydrated: true,
        lifecycle: "idle",
        topFadeEnabled: false,
      }),
    ).toEqual({ ready: true, target: { index: 1, viewPosition: 0, viewOffset: 16 } });
  });
});
