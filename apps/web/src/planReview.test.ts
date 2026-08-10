import { describe, expect, it } from "vite-plus/test";
import {
  EnvironmentId,
  OrchestrationProposedPlanId,
  ThreadId,
  TurnId,
  type ProviderInteractionMode,
} from "@t3tools/contracts";

import {
  findCompletedPlanReviewShell,
  findLatestPlanReviewShell,
  getCompletedPlanReviewSource,
  mergeThreadContextIds,
  type PlanReviewShellCandidate,
} from "./planReview";

const environmentId = EnvironmentId.make("env-1");
const planThreadId = ThreadId.make("thread-plan");
const planId = OrchestrationProposedPlanId.make("plan:thread-plan:turn:turn-1");

type LatestTurnLike = NonNullable<PlanReviewShellCandidate["latestTurn"]>;

function makeLatestTurn(overrides: Partial<LatestTurnLike> = {}): LatestTurnLike {
  return {
    turnId: TurnId.make("turn-review"),
    state: "completed" as const,
    startedAt: "2026-01-01T00:00:00.000Z",
    completedAt: "2026-01-01T00:05:00.000Z",
    sourceProposedPlan: { threadId: planThreadId, planId },
    ...overrides,
  };
}

function makeShell(overrides: Partial<PlanReviewShellCandidate> = {}): PlanReviewShellCandidate {
  return {
    id: ThreadId.make("thread-review"),
    environmentId,
    interactionMode: "plan",
    latestTurn: makeLatestTurn(),
    session: { status: "ready", activeTurnId: null },
    ...overrides,
  };
}

describe("getCompletedPlanReviewSource", () => {
  it("returns the source plan for a settled completed review turn", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-review"), interactionMode: "plan" },
        makeLatestTurn(),
        { status: "ready", activeTurnId: null },
      ),
    ).toEqual({ threadId: planThreadId, planId });
  });

  it("excludes default-mode threads, which implement plans instead", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-implement"), interactionMode: "default" },
        makeLatestTurn(),
        null,
      ),
    ).toBeNull();
  });

  it("excludes a turn that references its own thread", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: planThreadId, interactionMode: "plan" },
        makeLatestTurn(),
        null,
      ),
    ).toBeNull();
  });

  it("excludes running and errored turns", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-review"), interactionMode: "plan" },
        makeLatestTurn({ state: "running", completedAt: null }),
        null,
      ),
    ).toBeNull();
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-review"), interactionMode: "plan" },
        makeLatestTurn({ state: "error" }),
        null,
      ),
    ).toBeNull();
  });

  it("waits for the session to settle after completion", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-review"), interactionMode: "plan" },
        makeLatestTurn(),
        { status: "running", activeTurnId: TurnId.make("turn-review") },
      ),
    ).toBeNull();
  });

  it("excludes turns without a source plan reference", () => {
    expect(
      getCompletedPlanReviewSource(
        { id: ThreadId.make("thread-review"), interactionMode: "plan" },
        makeLatestTurn({ sourceProposedPlan: undefined }),
        null,
      ),
    ).toBeNull();
  });
});

describe("findCompletedPlanReviewShell", () => {
  const lookup = { environmentId, planThreadId, planId };

  it("finds the completed review shell for the plan", () => {
    const review = makeShell();
    expect(findCompletedPlanReviewShell([review], lookup)).toBe(review);
  });

  it("ignores shells from other environments, plans, and modes", () => {
    const otherEnvironment = makeShell({ environmentId: EnvironmentId.make("env-2") });
    const otherPlan = makeShell({
      latestTurn: makeLatestTurn({
        sourceProposedPlan: {
          threadId: planThreadId,
          planId: OrchestrationProposedPlanId.make("plan:thread-plan:turn:turn-2"),
        },
      }),
    });
    const implementShell = makeShell({
      id: ThreadId.make("thread-implement"),
      interactionMode: "default" as ProviderInteractionMode,
    });
    expect(
      findCompletedPlanReviewShell([otherEnvironment, otherPlan, implementShell], lookup),
    ).toBeNull();
  });

  it("ignores reviews that are still running", () => {
    const running = makeShell({
      latestTurn: makeLatestTurn({ state: "running", completedAt: null }),
      session: { status: "running", activeTurnId: TurnId.make("turn-review") },
    });
    expect(findCompletedPlanReviewShell([running], lookup)).toBeNull();
  });

  it("prefers the most recently completed review", () => {
    const older = makeShell({
      id: ThreadId.make("thread-review-old"),
      latestTurn: makeLatestTurn({ completedAt: "2026-01-01T00:01:00.000Z" }),
    });
    const newer = makeShell({
      id: ThreadId.make("thread-review-new"),
      latestTurn: makeLatestTurn({ completedAt: "2026-01-01T00:09:00.000Z" }),
    });
    expect(findCompletedPlanReviewShell([older, newer], lookup)).toBe(newer);
  });
});

describe("findLatestPlanReviewShell", () => {
  const lookup = { environmentId, planThreadId, planId };

  it("finds reviews that are running or awaiting user input", () => {
    const running = makeShell({
      latestTurn: makeLatestTurn({ state: "running", completedAt: null }),
      session: { status: "running", activeTurnId: TurnId.make("turn-review") },
    });
    expect(findLatestPlanReviewShell([running], lookup)).toBe(running);
  });

  it("finds completed reviews", () => {
    const completed = makeShell();
    expect(findLatestPlanReviewShell([completed], lookup)).toBe(completed);
  });

  it("ignores unrelated environments, plans, and implementation threads", () => {
    const otherEnvironment = makeShell({ environmentId: EnvironmentId.make("env-2") });
    const otherPlan = makeShell({
      latestTurn: makeLatestTurn({
        sourceProposedPlan: {
          threadId: planThreadId,
          planId: OrchestrationProposedPlanId.make("plan:thread-plan:turn:other"),
        },
      }),
    });
    const implementation = makeShell({ interactionMode: "default" });
    expect(
      findLatestPlanReviewShell([otherEnvironment, otherPlan, implementation], lookup),
    ).toBeNull();
  });

  it("selects the newest matching review deterministically", () => {
    const older = makeShell({
      id: ThreadId.make("thread-review-old"),
      latestTurn: makeLatestTurn({ startedAt: "2026-01-01T00:01:00.000Z" }),
    });
    const newer = makeShell({
      id: ThreadId.make("thread-review-new"),
      latestTurn: makeLatestTurn({ startedAt: "2026-01-01T00:09:00.000Z" }),
    });
    expect(findLatestPlanReviewShell([newer, older], lookup)).toBe(newer);
  });
});

describe("mergeThreadContextIds", () => {
  it("appends a missing reference and deduplicates an existing one", () => {
    const reviewThreadId = ThreadId.make("thread-review");
    const otherThreadId = ThreadId.make("thread-other");
    expect(mergeThreadContextIds([otherThreadId], reviewThreadId)).toEqual([
      otherThreadId,
      reviewThreadId,
    ]);
    expect(mergeThreadContextIds([otherThreadId, reviewThreadId], reviewThreadId)).toEqual([
      otherThreadId,
      reviewThreadId,
    ]);
  });
});
