/**
 * Roll (instance, model) usage totals up to per-instance totals.
 *
 * Kept separate from the SQL so the grouping rule is testable without a
 * database, and because "sum the models" is the only aggregation the wire
 * shape needs on top of what SQLite already grouped.
 *
 * @module providerUsageRollup
 */
import type {
  ServerProjectUsage,
  ServerProviderUsage,
  ServerThreadUsage,
  ThreadId,
} from "@t3tools/contracts";

import type {
  ProjectUsageTotals,
  ProviderInstanceUsageTotals,
  ThreadUsageModelTotals,
} from "../persistence/Services/ProviderInstanceUsage.ts";

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

/**
 * Avi Code addition: roll (project, instance, model) totals up to per-project
 * usage, each project carrying its per-credential breakdown.
 *
 * Groups rows by project, then reuses `rollUpProviderUsage` per project so the
 * instance/model shape is identical to the per-credential view. Project totals
 * sum across instances via `addCost`, preserving unreported cost. Projects are
 * ordered heaviest-first, the ones a person opening the view came to see.
 */
export const rollUpProjectUsage = (
  totals: ReadonlyArray<ProjectUsageTotals>,
): ReadonlyArray<ServerProjectUsage> => {
  const byProject = new Map<
    string,
    {
      readonly projectId: ProjectUsageTotals["projectId"];
      readonly projectTitle: string | null;
      readonly workspaceRoot: string | null;
      readonly rows: Array<ProviderInstanceUsageTotals>;
    }
  >();

  for (const total of totals) {
    const instanceRow: ProviderInstanceUsageTotals = {
      providerInstanceId: total.providerInstanceId,
      driverKind: total.driverKind,
      model: total.model,
      turns: total.turns,
      inputTokens: total.inputTokens,
      cachedInputTokens: total.cachedInputTokens,
      cacheCreationInputTokens: total.cacheCreationInputTokens,
      outputTokens: total.outputTokens,
      reasoningOutputTokens: total.reasoningOutputTokens,
      costUsd: total.costUsd,
    };

    const existing = byProject.get(total.projectId);
    if (existing) {
      existing.rows.push(instanceRow);
    } else {
      byProject.set(total.projectId, {
        projectId: total.projectId,
        projectTitle: total.projectTitle,
        workspaceRoot: total.workspaceRoot,
        rows: [instanceRow],
      });
    }
  }

  const projects = [...byProject.values()].map((project): ServerProjectUsage => {
    const instances = rollUpProviderUsage(project.rows);

    let turns = 0;
    let inputTokens = 0;
    let cachedInputTokens = 0;
    let cacheCreationInputTokens = 0;
    let outputTokens = 0;
    let reasoningOutputTokens = 0;
    let costUsd: number | null = null;

    for (const instance of instances) {
      turns += instance.turns;
      inputTokens += instance.inputTokens;
      cachedInputTokens += instance.cachedInputTokens;
      cacheCreationInputTokens += instance.cacheCreationInputTokens;
      outputTokens += instance.outputTokens;
      reasoningOutputTokens += instance.reasoningOutputTokens;
      costUsd = addCost(costUsd, instance.costUsd);
    }

    return {
      projectId: project.projectId,
      projectTitle: project.projectTitle,
      workspaceRoot: project.workspaceRoot,
      turns,
      inputTokens,
      cachedInputTokens,
      cacheCreationInputTokens,
      outputTokens,
      reasoningOutputTokens,
      costUsd,
      instances,
    };
  });

  return projects.toSorted(
    (left, right) =>
      right.inputTokens + right.outputTokens - (left.inputTokens + left.outputTokens) ||
      left.projectId.localeCompare(right.projectId),
  );
};

/**
 * Avi Code addition: sum a thread's per-model totals into one thread total.
 *
 * Returns null when the thread has no recorded usage, so callers can render
 * "nothing yet" rather than a row of zeros. Cost stays null unless some turn
 * reported one (via `addCost`), preserving the unreported-vs-zero distinction.
 */
export const rollUpThreadUsage = (
  threadId: ThreadId,
  totals: ReadonlyArray<ThreadUsageModelTotals>,
): ServerThreadUsage | null => {
  if (totals.length === 0) {
    return null;
  }

  let turns = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens = 0;
  let costUsd: number | null = null;

  for (const total of totals) {
    turns += total.turns;
    inputTokens += total.inputTokens;
    cachedInputTokens += total.cachedInputTokens;
    cacheCreationInputTokens += total.cacheCreationInputTokens;
    outputTokens += total.outputTokens;
    reasoningOutputTokens += total.reasoningOutputTokens;
    costUsd = addCost(costUsd, total.costUsd);
  }

  return {
    threadId,
    turns,
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens,
    costUsd,
    byModel: totals,
  };
};
