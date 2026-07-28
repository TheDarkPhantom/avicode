/**
 * Roll (instance, model) usage totals up to per-instance totals.
 *
 * Kept separate from the SQL so the grouping rule is testable without a
 * database, and because "sum the models" is the only aggregation the wire
 * shape needs on top of what SQLite already grouped.
 *
 * @module providerUsageRollup
 */
import type { ServerProviderUsage } from "@t3tools/contracts";

import type { ProviderInstanceUsageTotals } from "../persistence/Services/ProviderInstanceUsage.ts";

/**
 * Sum two optional costs, preserving "unreported".
 *
 * Null only survives when *neither* side reported a cost. A provider that
 * reports spend for some turns and not others still yields a number, because
 * a partial total is more useful than none — and the alternative, treating
 * unreported as zero everywhere, would make Codex look free rather than
 * unmeasured.
 */
const addCost = (left: number | null, right: number | null): number | null => {
  if (left === null) {
    return right;
  }
  if (right === null) {
    return left;
  }
  return left + right;
};

export const rollUpProviderUsage = (
  totals: ReadonlyArray<ProviderInstanceUsageTotals>,
): ReadonlyArray<ServerProviderUsage> => {
  const byInstance = new Map<string, ServerProviderUsage>();

  for (const total of totals) {
    const existing = byInstance.get(total.providerInstanceId);
    const modelTotals = {
      model: total.model,
      turns: total.turns,
      inputTokens: total.inputTokens,
      cachedInputTokens: total.cachedInputTokens,
      cacheCreationInputTokens: total.cacheCreationInputTokens,
      outputTokens: total.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens,
      costUsd: total.costUsd,
    };

    byInstance.set(
      total.providerInstanceId,
      existing
        ? {
            ...existing,
            turns: existing.turns + total.turns,
            inputTokens: existing.inputTokens + total.inputTokens,
            cachedInputTokens: existing.cachedInputTokens + total.cachedInputTokens,
            cacheCreationInputTokens:
              existing.cacheCreationInputTokens + total.cacheCreationInputTokens,
            outputTokens: existing.outputTokens + total.outputTokens,
            reasoningOutputTokens: existing.reasoningOutputTokens + total.reasoningOutputTokens,
            costUsd: addCost(existing.costUsd, total.costUsd),
            byModel: [...existing.byModel, modelTotals],
          }
        : {
            instanceId: total.providerInstanceId,
            driver: total.driverKind,
            turns: total.turns,
            inputTokens: total.inputTokens,
            cachedInputTokens: total.cachedInputTokens,
            cacheCreationInputTokens: total.cacheCreationInputTokens,
            outputTokens: total.outputTokens,
            reasoningOutputTokens: total.reasoningOutputTokens,
            costUsd: total.costUsd,
            byModel: [modelTotals],
          },
    );
  }

  // Heaviest users first — the ones a person opening a usage view came to see.
  return [...byInstance.values()].toSorted(
    (left, right) =>
      right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens) ||
      left.instanceId.localeCompare(right.instanceId),
  );
};
