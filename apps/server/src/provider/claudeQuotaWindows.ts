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
  extra_usage: "Extra usage",
};

/**
 * Nominal window lengths, which Claude never reports but which its window ids imply.
 *
 * Clients need a duration to tell "38% left with a day to go" from "38% left with a
 * week to go" — without one, a window that is about to roll over looks as scarce as one
 * that has to last all week.
 *
 * `overage` and `extra_usage` are deliberately absent: paid-overage allowances are
 * not fixed-length rolling windows, and inventing a length for them would produce a
 * confidently wrong reading. An unknown duration must stay unknown so clients fall
 * back to the raw remaining percentage.
 */
const CLAUDE_QUOTA_WINDOW_MINUTES: Record<string, number> = {
  five_hour: 5 * 60,
  seven_day: 7 * 24 * 60,
  seven_day_opus: 7 * 24 * 60,
  seven_day_sonnet: 7 * 24 * 60,
  seven_day_oauth_apps: 7 * 24 * 60,
};

/**
 * Display label for a window id. Unrecognized ids are humanized from their
 * snake_case (`nimbus_quill` → "Nimbus quill") rather than shown raw — clients
 * filter on the id, never the label, so this is purely cosmetic and safe for
 * window types Anthropic adds without notice.
 */
export function claudeQuotaWindowLabel(id: string): string {
  const known = CLAUDE_QUOTA_WINDOW_LABELS[id];
  if (known !== undefined) {
    return known;
  }
  const words = id.replaceAll("_", " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}

export function claudeQuotaWindowMinutes(id: string): number | undefined {
  return CLAUDE_QUOTA_WINDOW_MINUTES[id];
}
