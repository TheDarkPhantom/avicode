import { describe, expect, it } from "vite-plus/test";

import {
  diffEventMarksImplementation,
  selectPlanToMarkImplemented,
  type ActionablePlanCandidate,
} from "./proposedPlanImplementation.ts";

const plan = (overrides: Partial<ActionablePlanCandidate>): ActionablePlanCandidate => ({
  id: "plan-1",
  turnId: "turn-plan",
  implementedAt: null,
  discardedAt: null,
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...overrides,
});

describe("diffEventMarksImplementation", () => {
  it("marks when the diff is ready with at least one changed file", () => {
    expect(diffEventMarksImplementation({ status: "ready", fileCount: 1 })).toBe(true);
  });

  it("does not mark a ready diff with no changed files", () => {
    expect(diffEventMarksImplementation({ status: "ready", fileCount: 0 })).toBe(false);
  });

  it("does not mark a missing or errored diff", () => {
    expect(diffEventMarksImplementation({ status: "missing", fileCount: 3 })).toBe(false);
    expect(diffEventMarksImplementation({ status: "error", fileCount: 3 })).toBe(false);
  });
});

describe("selectPlanToMarkImplemented", () => {
  it("selects the latest actionable plan not produced by the change turn", () => {
    const selected = selectPlanToMarkImplemented(
      [
        plan({ id: "plan-a", turnId: "turn-a", updatedAt: "2026-01-01T00:00:00.000Z" }),
        plan({ id: "plan-b", turnId: "turn-b", updatedAt: "2026-01-02T00:00:00.000Z" }),
      ],
      "turn-build",
    );
    expect(selected?.id).toBe("plan-b");
  });

  it("skips a plan whose own proposal turn is the change turn", () => {
    const selected = selectPlanToMarkImplemented(
      [plan({ id: "plan-a", turnId: "turn-build" })],
      "turn-build",
    );
    expect(selected).toBeNull();
  });

  it("ignores already-implemented plans", () => {
    const selected = selectPlanToMarkImplemented(
      [plan({ id: "plan-a", turnId: "turn-a", implementedAt: "2026-01-01T00:00:00.000Z" })],
      "turn-build",
    );
    expect(selected).toBeNull();
  });

  it("ignores discarded plans", () => {
    const selected = selectPlanToMarkImplemented(
      [plan({ id: "plan-a", turnId: "turn-a", discardedAt: "2026-01-01T00:00:00.000Z" })],
      "turn-build",
    );
    expect(selected).toBeNull();
  });

  it("returns null when there are no plans", () => {
    expect(selectPlanToMarkImplemented([], "turn-build")).toBeNull();
  });

  it("allows a plan with a null proposal turn", () => {
    const selected = selectPlanToMarkImplemented(
      [plan({ id: "plan-a", turnId: null })],
      "turn-build",
    );
    expect(selected?.id).toBe("plan-a");
  });

  it("breaks updatedAt ties by id", () => {
    const selected = selectPlanToMarkImplemented(
      [plan({ id: "plan-a", turnId: "turn-a" }), plan({ id: "plan-b", turnId: "turn-b" })],
      "turn-build",
    );
    expect(selected?.id).toBe("plan-b");
  });
});
