import type { ProviderQuotaSnapshot, ProviderQuotaWindow } from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import * as Option from "effect/Option";

function clampUsedPercent(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(100, value))
    : null;
}

function resetEpochSecondsToIso(value: unknown): string | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const instant = DateTime.make(value * 1_000);
  return Option.isNone(instant) ? undefined : DateTime.formatIso(instant.value);
}

function codexWindowLabel(minutes: unknown): string {
  if (typeof minutes !== "number" || !Number.isFinite(minutes)) return "Usage";
  if (minutes <= 60) return "Hourly";
  if (minutes <= 60 * 8) return `${Math.round(minutes / 60)}-hour`;
  if (minutes <= 60 * 24 * 2) return "Daily";
  if (minutes <= 60 * 24 * 10) return "Weekly";
  return "Monthly";
}

export function normalizeCodexProbeQuota(
  value: unknown,
  capturedAt: string,
): ProviderQuotaSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const response = value as Record<string, unknown>;
  const rateLimits =
    response.rateLimits && typeof response.rateLimits === "object"
      ? (response.rateLimits as Record<string, unknown>)
      : response;
  const windows: ProviderQuotaWindow[] = [];

  for (const id of ["primary", "secondary"] as const) {
    const rawWindow = rateLimits[id];
    if (!rawWindow || typeof rawWindow !== "object" || Array.isArray(rawWindow)) continue;
    const window = rawWindow as Record<string, unknown>;
    const usedPercent = clampUsedPercent(window.usedPercent);
    if (usedPercent === null) continue;
    const resetsAt = resetEpochSecondsToIso(window.resetsAt);
    const windowMinutes =
      typeof window.windowDurationMins === "number" && Number.isFinite(window.windowDurationMins)
        ? Math.max(0, Math.round(window.windowDurationMins))
        : undefined;
    windows.push({
      id,
      label: codexWindowLabel(window.windowDurationMins),
      usedPercent,
      ...(resetsAt ? { resetsAt } : {}),
      ...(windowMinutes !== undefined ? { windowMinutes } : {}),
    });
  }

  if (windows.length === 0) return undefined;
  const exhausted =
    rateLimits.spendControlReached === true ||
    (rateLimits.rateLimitReachedType !== undefined && rateLimits.rateLimitReachedType !== null);
  const planType =
    typeof rateLimits.planType === "string" && rateLimits.planType.trim()
      ? rateLimits.planType.trim()
      : undefined;
  return {
    windows: exhausted ? windows.map((window) => ({ ...window, exhausted: true })) : windows,
    ...(planType ? { planType } : {}),
    status: exhausted ? "exhausted" : "ok",
    capturedAt,
  };
}

function claudeWindowLabel(id: string): string {
  return (
    {
      five_hour: "5-hour",
      seven_day: "Weekly",
      seven_day_opus: "Weekly (Opus)",
      seven_day_sonnet: "Weekly (Sonnet)",
      seven_day_oauth_apps: "Weekly (apps)",
      overage: "Overage",
    }[id] ?? id
  );
}

export function normalizeClaudeProbeQuota(
  value: unknown,
  capturedAt: string,
): ProviderQuotaSnapshot | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const response = value as Record<string, unknown>;
  if (response.rate_limits_available === false) return undefined;
  const rateLimits = response.rate_limits;
  if (!rateLimits || typeof rateLimits !== "object" || Array.isArray(rateLimits)) {
    return undefined;
  }

  const windows: ProviderQuotaWindow[] = [];
  for (const [id, rawLimit] of Object.entries(rateLimits as Record<string, unknown>)) {
    if (!rawLimit || typeof rawLimit !== "object" || Array.isArray(rawLimit)) continue;
    const limit = rawLimit as Record<string, unknown>;
    const usedPercent = clampUsedPercent(limit.utilization);
    if (usedPercent === null) continue;
    const resetsAt =
      typeof limit.resets_at === "string" && limit.resets_at ? limit.resets_at : undefined;
    windows.push({
      id,
      label: claudeWindowLabel(id),
      usedPercent,
      ...(resetsAt ? { resetsAt } : {}),
    });
  }

  if (windows.length === 0) return undefined;
  const planType =
    typeof response.subscription_type === "string" && response.subscription_type.trim()
      ? response.subscription_type.trim()
      : undefined;
  return {
    windows,
    ...(planType ? { planType } : {}),
    capturedAt,
  };
}
