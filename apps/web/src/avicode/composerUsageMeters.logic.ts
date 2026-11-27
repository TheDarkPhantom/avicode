import type { ProjectUsageEntry, ServerProviderUsageWindow } from "@t3tools/contracts";
import { remainingPercent } from "@t3tools/shared/usageLimits";
import { limitsNotice } from "@t3tools/shared/usageLimitsCopy";

import type { ThreadDetailsLimits } from "../components/chat/ThreadDetailsUsage.logic";

export interface ThreadUsageTotals {
  readonly turns: number;
  /** Includes cache reads and writes. */
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheCreationTokens: number;
  readonly outputTokens: number;
  /** Null when no turn has a price: unknown, not free. */
  readonly costUsd: number | null;
  readonly unpricedTurns: number;
}

/** One thread's entries summed across accounts and models. Null until a turn is recorded. */
export function threadUsageTotals(entries: readonly ProjectUsageEntry[]): ThreadUsageTotals | null {
  let totals: ThreadUsageTotals = {
    turns: 0,
    inputTokens: 0,
    cachedInputTokens: 0,
    cacheCreationTokens: 0,
    outputTokens: 0,
    costUsd: null,
    unpricedTurns: 0,
  };
  for (const entry of entries) {
    totals = {
      turns: totals.turns + entry.turns,
      inputTokens: totals.inputTokens + entry.inputTokens,
      cachedInputTokens: totals.cachedInputTokens + entry.cachedInputTokens,
      cacheCreationTokens: totals.cacheCreationTokens + entry.cacheCreationTokens,
      outputTokens: totals.outputTokens + entry.outputTokens,
      costUsd:
        entry.costUsd === null
          ? totals.costUsd
          : totals.costUsd === null
            ? entry.costUsd
            : totals.costUsd + entry.costUsd,
      unpricedTurns: totals.unpricedTurns + entry.unpricedTurns,
    };
  }
  return totals.turns === 0 ? null : totals;
}

/** Room left, in percent, in each limit window the quota popover lists, in its order. */
export function limitWindowsLeft(
  resolved: ThreadDetailsLimits | null,
  quotaWindows: readonly ServerProviderUsageWindow[],
): number[] {
  const lefts =
    resolved?.kind === "pool"
      ? resolved.windows.map((window) => window.remainingPercent)
      : resolved && limitsNotice(resolved.limits) === null
        ? resolved.limits.windows.map(remainingPercent)
        : [];
  return [...lefts, ...quotaWindows.map(remainingPercent)];
}

export type MeterTone = "error" | "warning" | null;

/** Matches the Thread details limit rows. */
export const limitLeftTone = (left: number): MeterTone =>
  left <= 10 ? "error" : left <= 20 ? "warning" : null;

/** Matches the Thread details context row. */
export const contextUsedTone = (used: number): MeterTone =>
  used >= 90 ? "error" : used >= 80 ? "warning" : null;
