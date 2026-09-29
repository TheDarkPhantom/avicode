import {
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  TurnId,
  type OrchestrationThreadShell,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { isThreadSettledForToggle } from "./threadSettleToggle";

const NOW = "2026-04-10T00:00:00.000Z";
const STALE = "2026-04-01T00:00:00.000Z";

function makeShell(input: {
  readonly settledOverride?: "settled" | "active" | null;
  readonly activityAt?: string;
  readonly sessionStatus?: "running";
}): OrchestrationThreadShell {
  const threadId = ThreadId.make("thread-1");
  return {
    id: threadId,
    projectId: ProjectId.make("project-1"),
    title: "Thread",
    modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
    runtimeMode: "full-access",
    interactionMode: "default",
    branch: null,
    worktreePath: null,
    latestTurn: {
      turnId: TurnId.make("turn-1"),
      state: "completed",
      requestedAt: input.activityAt ?? NOW,
      startedAt: null,
      completedAt: null,
      assistantMessageId: null,
    },
    createdAt: STALE,
    updatedAt: NOW,
    archivedAt: null,
    settledOverride: input.settledOverride ?? null,
    settledAt: input.settledOverride === "settled" ? NOW : null,
    session:
      input.sessionStatus === undefined
        ? null
        : {
            threadId,
            status: input.sessionStatus,
            providerName: "Codex",
            runtimeMode: "full-access",
            activeTurnId: null,
            lastError: null,
            updatedAt: NOW,
          },
    latestUserMessageAt: null,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    hasActionableProposedPlan: false,
  };
}

const supported = { supportsSettlement: true, now: NOW, autoSettleAfterDays: 3 } as const;

describe("isThreadSettledForToggle", () => {
  it("restores an explicitly settled thread", () => {
    expect(isThreadSettledForToggle(makeShell({ settledOverride: "settled" }), supported)).toBe(
      true,
    );
  });

  it("restores a thread auto-settled by inactivity, as the sidebar shows it", () => {
    expect(isThreadSettledForToggle(makeShell({ activityAt: STALE }), supported)).toBe(true);
    expect(
      isThreadSettledForToggle(makeShell({ activityAt: STALE }), {
        ...supported,
        autoSettleAfterDays: null,
      }),
    ).toBe(false);
  });

  it("settles active, pinned, and running threads", () => {
    expect(isThreadSettledForToggle(makeShell({}), supported)).toBe(false);
    expect(
      isThreadSettledForToggle(
        makeShell({ settledOverride: "active", activityAt: STALE }),
        supported,
      ),
    ).toBe(false);
    expect(
      isThreadSettledForToggle(
        makeShell({ settledOverride: "settled", sessionStatus: "running" }),
        supported,
      ),
    ).toBe(false);
  });

  it("never reads as settled without the settlement capability", () => {
    expect(
      isThreadSettledForToggle(makeShell({ settledOverride: "settled" }), {
        ...supported,
        supportsSettlement: false,
      }),
    ).toBe(false);
  });
});
