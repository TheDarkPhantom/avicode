/**
 * Claude's plan-window vocabulary, shared by the live adapter and the capability probe.
 *
 * Both paths normalize the same `rate_limits` payload into `ProviderQuotaWindow`s, so
 * keeping one copy of the lookups is what stops the two from drifting into disagreeing
 * about what `seven_day_opus` is called or how long it lasts.
 */

/**
 * Labels for the plan windows the SDK reports. Kept as a lookup rather than a
 * closed union so an unrecognized window still renders (as its raw id) instead
 * of being dropped — Anthropic adds window types without notice.
 */
const CLAUDE_QUOTA_WINDOW_LABELS: Record<string, string> = {
  five_hour: "5-hour",
  seven_day: "Weekly",
  seven_day_opus: "Weekly (Opus)",
  seven_day_sonnet: "Weekly (Sonnet)",
  seven_day_oauth_apps: "Weekly (apps)",
  overage: "Overage",
};

/**
 * Nominal window lengths, which Claude never reports but which its window ids imply.
 *
 * Clients need a duration to tell "38% left with a day to go" from "38% left with a
 * week to go" — without one, a window that is about to roll over looks as scarce as one
 * that has to last all week.
 *
 * `overage` is deliberately absent: it is not a fixed-length rolling window, and
 * inventing a length for it would produce a confidently wrong reading. An unknown
 * duration must stay unknown so clients fall back to the raw remaining percentage.
 */
const CLAUDE_QUOTA_WINDOW_MINUTES: Record<string, number> = {
  five_hour: 5 * 60,
  seven_day: 7 * 24 * 60,
  seven_day_opus: 7 * 24 * 60,
  seven_day_sonnet: 7 * 24 * 60,
  seven_day_oauth_apps: 7 * 24 * 60,
};

export function claudeQuotaWindowLabel(id: string): string {
  return CLAUDE_QUOTA_WINDOW_LABELS[id] ?? id;
}

export function claudeQuotaWindowMinutes(id: string): number | undefined {
  return CLAUDE_QUOTA_WINDOW_MINUTES[id];
}
