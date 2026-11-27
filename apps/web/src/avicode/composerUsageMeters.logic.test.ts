import type { ProjectUsageEntry, ServerProviderUsageWindow } from "@t3tools/contracts";
import type { LimitPoolWindow } from "@t3tools/shared/usageLimits";
import { describe, expect, it } from "vite-plus/test";

import {
  contextUsedTone,
  limitLeftTone,
  threadUsageTotals,
  limitWindowsLeft,
} from "./composerUsageMeters.logic";

const entry = (overrides: Partial<ProjectUsageEntry>): ProjectUsageEntry => ({
  providerInstanceId: "claudeAgent",
  driver: "claudeAgent",
  model: "claude-opus-4-6",
  turns: 1,
  inputTokens: 100,
  cachedInputTokens: 40,
  cacheCreationTokens: 10,
  outputTokens: 10,
  costUsd: 1,
  unpricedTurns: 0,
  ...overrides,
});

const usageWindow = (id: string, usedPercent: number): ServerProviderUsageWindow => ({
  id,
  kind: "session",
  label: id,
  usedPercent,
});

describe("threadUsageTotals", () => {
  it("adds every account and model, keeping a missing price out of the cost", () => {
    expect(
      threadUsageTotals([
        entry({}),
        entry({ providerInstanceId: "codex", driver: "codex", costUsd: 0.5, turns: 2 }),
        entry({ model: "mystery", costUsd: null, unpricedTurns: 1 }),
      ]),
    ).toEqual({
      turns: 4,
      inputTokens: 300,
      cachedInputTokens: 120,
      cacheCreationTokens: 30,
      outputTokens: 30,
      costUsd: 1.5,
      unpricedTurns: 1,
    });
  });

  it("reports no cost when no turn has a price", () => {
    expect(threadUsageTotals([entry({ costUsd: null, unpricedTurns: 1 })])?.costUsd).toBeNull();
  });

  it("hides until the thread has a turn", () => {
    expect(threadUsageTotals([])).toBeNull();
  });
});

describe("limitWindowsLeft", () => {
  it("reads the room left in each window, provider windows first", () => {
    const limits = {
      checkedAt: "2026-11-27T00:00:00.000Z",
      windows: [usageWindow("session", 30), usageWindow("weekly", 85)],
    };
    expect(limitWindowsLeft({ kind: "instance", limits }, [])).toEqual([70, 15]);
    expect(limitWindowsLeft({ kind: "instance", limits }, [usageWindow("hub", 95)])).toEqual([
      70, 15, 5,
    ]);
  });

  it("reads a hub pool's windows", () => {
    const pooled = { remainingPercent: 42 } as LimitPoolWindow;
    expect(limitWindowsLeft({ kind: "pool", windows: [pooled] }, [])).toEqual([42]);
  });

  it("shows nothing when the account reports no limits", () => {
    const unavailable = {
      checkedAt: "2026-11-27T00:00:00.000Z",
      windows: [],
      unavailable: { reason: "unsupported" as const },
    };
    expect(limitWindowsLeft({ kind: "instance", limits: unavailable }, [])).toEqual([]);
    expect(limitWindowsLeft(null, [])).toEqual([]);
  });
});

describe("meter tones", () => {
  it("match the Thread details thresholds", () => {
    expect([limitLeftTone(25), limitLeftTone(20), limitLeftTone(10)]).toEqual([
      null,
      "warning",
      "error",
    ]);
    expect([contextUsedTone(79), contextUsedTone(80), contextUsedTone(90)]).toEqual([
      null,
      "warning",
      "error",
    ]);
  });
});
