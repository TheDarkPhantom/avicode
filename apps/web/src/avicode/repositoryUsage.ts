import type { ProjectUsageEntry, ProjectUsageSummary } from "@t3tools/contracts";

export interface UsageTotals {
  readonly turns: number;
  readonly tokens: number;
  /** Null when nothing inside reported a cost. */
  readonly costUsd: number | null;
  readonly unpricedTurns: number;
}

interface ModelUsageRow extends UsageTotals {
  readonly model: string | null;
}

interface AccountUsageRow extends UsageTotals {
  readonly providerInstanceId: string;
  readonly driver: string;
  readonly models: readonly ModelUsageRow[];
}

interface RepositoryUsageRow extends UsageTotals {
  readonly key: string;
  readonly title: string | null;
  readonly workspaceRoot: string | null;
  readonly accounts: readonly AccountUsageRow[];
}

export type RepositoryUsageMetric = "cost" | "tokens";

const EMPTY: UsageTotals = { turns: 0, tokens: 0, costUsd: null, unpricedTurns: 0 };

function addTotals(left: UsageTotals, right: UsageTotals): UsageTotals {
  return {
    turns: left.turns + right.turns,
    tokens: left.tokens + right.tokens,
    costUsd:
      left.costUsd === null
        ? right.costUsd
        : right.costUsd === null
          ? left.costUsd
          : left.costUsd + right.costUsd,
    unpricedTurns: left.unpricedTurns + right.unpricedTurns,
  };
}

const entryTotals = (entry: ProjectUsageEntry): UsageTotals => ({
  turns: entry.turns,
  tokens: entry.inputTokens + entry.outputTokens,
  costUsd: entry.costUsd,
  unpricedTurns: entry.unpricedTurns,
});

const metricValue = (totals: UsageTotals, metric: RepositoryUsageMetric) =>
  metric === "cost" ? (totals.costUsd ?? 0) : totals.tokens;

function byMetric(metric: RepositoryUsageMetric) {
  return (a: UsageTotals, b: UsageTotals) =>
    metricValue(b, metric) - metricValue(a, metric) || b.tokens - a.tokens;
}

/** Repositories with their accounts and models, largest first by the page's metric. */
export function repositoryUsageRows(
  summary: ProjectUsageSummary,
  metric: RepositoryUsageMetric,
): RepositoryUsageRow[] {
  const sort = byMetric(metric);
  return summary.projects
    .map((project) => {
      const accounts = new Map<string, AccountUsageRow>();
      for (const entry of project.entries) {
        const key = `${entry.providerInstanceId}\0${entry.driver}`;
        const account = accounts.get(key);
        const model: ModelUsageRow = { model: entry.model, ...entryTotals(entry) };
        accounts.set(key, {
          ...addTotals(account ?? EMPTY, model),
          providerInstanceId: entry.providerInstanceId,
          driver: entry.driver,
          models: [...(account?.models ?? []), model],
        });
      }
      const accountRows = [...accounts.values()]
        .map((account) => ({ ...account, models: account.models.toSorted(sort) }))
        .toSorted(sort);
      return {
        ...accountRows.reduce<UsageTotals>(addTotals, EMPTY),
        key: project.projectId ?? "",
        title: project.title,
        workspaceRoot: project.workspaceRoot,
        accounts: accountRows,
      };
    })
    .toSorted(sort);
}

/** The repository's name, else the last part of its folder. */
export function repositoryLabel(row: Pick<RepositoryUsageRow, "title" | "workspaceRoot">) {
  if (row.title !== null && row.title.trim().length > 0) return row.title;
  const parts = row.workspaceRoot?.split(/[\\/]/u).filter((part) => part.length > 0) ?? [];
  return parts.at(-1) ?? null;
}
