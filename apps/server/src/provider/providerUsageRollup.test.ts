import { ProviderDriverKind, ProviderInstanceId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { rollUpProviderUsage } from "./providerUsageRollup.ts";
import type { ProviderInstanceUsageTotals } from "../persistence/Services/ProviderInstanceUsage.ts";

const codexDriver = ProviderDriverKind.make("codex");
const claudeDriver = ProviderDriverKind.make("claudeAgent");

const totals = (input: {
  readonly instanceId: string;
  readonly model: string | null;
  readonly driverKind?: ProviderDriverKind;
  readonly turns?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly costUsd?: number | null;
}): ProviderInstanceUsageTotals => ({
  providerInstanceId: ProviderInstanceId.make(input.instanceId),
  driverKind: input.driverKind ?? codexDriver,
  model: input.model,
  turns: input.turns ?? 1,
  inputTokens: input.inputTokens ?? 100,
  cachedInputTokens: 10,
  cacheCreationInputTokens: 5,
  outputTokens: input.outputTokens ?? 50,
  reasoningOutputTokens: 3,
  costUsd: input.costUsd ?? null,
});

describe("rollUpProviderUsage", () => {
  it("sums a instance's models into one entry while keeping the breakdown", () => {
    const [instance] = rollUpProviderUsage([
      totals({ instanceId: "codex_work", model: "gpt-5", turns: 2, inputTokens: 100 }),
      totals({ instanceId: "codex_work", model: "gpt-5-mini", turns: 3, inputTokens: 400 }),
    ]);

    expect(instance?.instanceId).toBe("codex_work");
    expect(instance?.turns).toBe(5);
    expect(instance?.inputTokens).toBe(500);
    expect(instance?.byModel.map((entry) => entry.model)).toEqual(["gpt-5", "gpt-5-mini"]);
  });

  it("keeps separate instances of the same driver apart", () => {
    const rolled = rollUpProviderUsage([
      totals({ instanceId: "codex_work", model: "gpt-5" }),
      totals({ instanceId: "codex_personal", model: "gpt-5" }),
    ]);

    expect(rolled).toHaveLength(2);
    expect(rolled.map((entry) => entry.instanceId).toSorted()).toEqual([
      "codex_personal",
      "codex_work",
    ]);
  });

  it("keeps cost null when no model in the instance reported one", () => {
    const [instance] = rollUpProviderUsage([
      totals({ instanceId: "codex_work", model: "gpt-5", costUsd: null }),
      totals({ instanceId: "codex_work", model: "gpt-5-mini", costUsd: null }),
    ]);

    // Null rather than 0 — Codex reports no spend, and showing "$0.00" would
    // claim it was free.
    expect(instance?.costUsd).toBeNull();
  });

  it("sums cost across models that reported one, ignoring those that did not", () => {
    const [instance] = rollUpProviderUsage([
      totals({ instanceId: "claude", model: "opus", driverKind: claudeDriver, costUsd: 0.2 }),
      totals({ instanceId: "claude", model: "haiku", driverKind: claudeDriver, costUsd: null }),
      totals({ instanceId: "claude", model: "sonnet", driverKind: claudeDriver, costUsd: 0.05 }),
    ]);

    expect(instance?.costUsd).toBeCloseTo(0.25, 9);
  });

  it("orders heaviest users first", () => {
    const rolled = rollUpProviderUsage([
      totals({ instanceId: "light", model: "m", inputTokens: 1, outputTokens: 1 }),
      totals({ instanceId: "heavy", model: "m", inputTokens: 900, outputTokens: 900 }),
      totals({ instanceId: "middle", model: "m", inputTokens: 50, outputTokens: 50 }),
    ]);

    expect(rolled.map((entry) => entry.instanceId)).toEqual(["heavy", "middle", "light"]);
  });

  it("returns nothing when there is no usage", () => {
    expect(rollUpProviderUsage([])).toEqual([]);
  });
});
