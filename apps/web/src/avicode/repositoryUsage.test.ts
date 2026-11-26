import type { ProjectUsageEntry, ProjectUsageSummary } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { repositoryLabel, repositoryUsageRows } from "./repositoryUsage";

const entry = (overrides: Partial<ProjectUsageEntry>): ProjectUsageEntry => ({
  providerInstanceId: "claudeAgent",
  driver: "claudeAgent",
  model: "claude-opus-4-6",
  turns: 1,
  inputTokens: 100,
  cachedInputTokens: 0,
  cacheCreationTokens: 0,
  outputTokens: 10,
  costUsd: 1,
  unpricedTurns: 0,
  ...overrides,
});

const summary: ProjectUsageSummary = {
  readAt: "2026-11-26T00:00:00.000Z",
  projects: [
    {
      projectId: "small",
      title: "small",
      workspaceRoot: "/repos/small",
      entries: [entry({ costUsd: 2 })],
    },
    {
      projectId: "big",
      title: "big",
      workspaceRoot: "/repos/big",
      entries: [
        entry({ providerInstanceId: "claudeAgent_lawrence", costUsd: 3 }),
        entry({
          providerInstanceId: "claudeAgent_lawrence",
          model: "claude-haiku-4-5",
          costUsd: 4,
        }),
        entry({
          providerInstanceId: "codex",
          driver: "codex",
          model: "gpt-5.5",
          inputTokens: 10_000,
          costUsd: null,
          unpricedTurns: 1,
        }),
      ],
    },
  ],
};

describe("repositoryUsageRows", () => {
  it("totals each repository and account, keeping unreported cost apart from zero", () => {
    const [big, small] = repositoryUsageRows(summary, "cost");
    expect(big).toMatchObject({ key: "big", turns: 3, tokens: 10_230, costUsd: 7 });
    expect(big!.unpricedTurns).toBe(1);
    expect(big!.accounts.map((account) => [account.providerInstanceId, account.costUsd])).toEqual([
      ["claudeAgent_lawrence", 7],
      ["codex", null],
    ]);
    expect(big!.accounts[0]!.models.map((model) => model.model)).toEqual([
      "claude-haiku-4-5",
      "claude-opus-4-6",
    ]);
    expect(small).toMatchObject({ key: "small", costUsd: 2 });
  });

  it("orders by tokens when the page shows tokens", () => {
    const rows = repositoryUsageRows(summary, "tokens");
    expect(rows[0]!.accounts.map((account) => account.providerInstanceId)).toEqual([
      "codex",
      "claudeAgent_lawrence",
    ]);
  });
});

describe("repositoryLabel", () => {
  it("falls back to the folder name", () => {
    expect(repositoryLabel({ title: null, workspaceRoot: "C:\\repos\\avicode\\" })).toBe("avicode");
    expect(repositoryLabel({ title: null, workspaceRoot: null })).toBeNull();
  });
});
