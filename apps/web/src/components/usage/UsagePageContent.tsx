import type { ProviderDriverKind, ServerProvider, ServerProviderUsage } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { RefreshCwIcon } from "lucide-react";
import { useMemo, useState } from "react";

import { primaryServerProvidersAtom } from "~/state/server";
import { serverEnvironment } from "~/state/server";
import { usePrimaryEnvironmentId } from "~/state/environments";
import { useEnvironmentQuery } from "~/state/query";
import { filterNonOverageWindows, formatQuotaCost, formatTokenCount } from "~/lib/providerQuota";
import { cn } from "~/lib/utils";
import { PROVIDER_ICON_BY_PROVIDER } from "../chat/providerIconUtils";
import { UsageQuotaSummary } from "./UsageQuotaSummary";

function hasVisibleQuota(provider: ServerProvider): boolean {
  const quota = provider.quota;
  if (!quota || quota.windows.length === 0) return false;
  return filterNonOverageWindows(quota.windows).length > 0;
}

function InstanceUsageCard(props: {
  usage: ServerProviderUsage;
  instanceLabel: string;
  driverKind?: ProviderDriverKind;
}) {
  const { usage, instanceLabel, driverKind } = props;
  const [expanded, setExpanded] = useState(false);
  const totalTokens = usage.inputTokens + usage.outputTokens;
  // Avi Code addition: show provider icon next to the instance name.
  const DriverIcon = driverKind ? (PROVIDER_ICON_BY_PROVIDER[driverKind] ?? null) : null;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
          {DriverIcon ? <DriverIcon className="size-4 shrink-0" aria-hidden /> : null}
          {instanceLabel}
        </div>
        <div className="text-xs text-muted-foreground/70">{usage.turns} turns</div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-4">
        <div>
          <div className="text-muted-foreground/60">Input</div>
          <div className="font-medium tabular-nums text-foreground">
            {formatTokenCount(usage.inputTokens)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">Output</div>
          <div className="font-medium tabular-nums text-foreground">
            {formatTokenCount(usage.outputTokens)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">Total</div>
          <div className="font-medium tabular-nums text-foreground">
            {formatTokenCount(totalTokens)}
          </div>
        </div>
        <div>
          <div className="text-muted-foreground/60">Cost</div>
          <div className="font-medium tabular-nums text-foreground">
            {formatQuotaCost(usage.costUsd)}
          </div>
        </div>
      </div>

      {usage.cachedInputTokens > 0 || usage.reasoningOutputTokens > 0 ? (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground/50">
          {usage.cachedInputTokens > 0 ? (
            <span>Cached: {formatTokenCount(usage.cachedInputTokens)}</span>
          ) : null}
          {usage.cacheCreationInputTokens > 0 ? (
            <span>Cache write: {formatTokenCount(usage.cacheCreationInputTokens)}</span>
          ) : null}
          {usage.reasoningOutputTokens > 0 ? (
            <span>Reasoning: {formatTokenCount(usage.reasoningOutputTokens)}</span>
          ) : null}
        </div>
      ) : null}

      {usage.byModel.length > 1 ? (
        <div className="mt-3">
          <button
            type="button"
            className="text-[11px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
            onClick={() => {
              setExpanded((prev) => !prev);
            }}
          >
            {expanded ? "Hide" : "Show"} model breakdown ({usage.byModel.length})
          </button>
          {expanded ? (
            <div className="mt-2 flex flex-col gap-1">
              {usage.byModel.map((model) => (
                <div
                  key={model.model ?? "unknown"}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/30 px-2.5 py-1.5 text-[11px]"
                >
                  <span className="truncate font-medium text-foreground">
                    {model.model ?? "Unknown"}
                  </span>
                  <div className="flex shrink-0 gap-3 text-muted-foreground tabular-nums">
                    <span>{model.turns} turns</span>
                    <span>{formatTokenCount(model.inputTokens + model.outputTokens)} tokens</span>
                    <span>{formatQuotaCost(model.costUsd)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : usage.byModel.length === 1 && usage.byModel[0]?.model ? (
        <div className="mt-2 text-[11px] text-muted-foreground/50">
          Model: {usage.byModel[0].model}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Avi Code addition: full Usage page content showing both live quota gauges and
 * queried token/cost usage for all provider instances. Upstream has no
 * equivalent surface; usage was previously only visible per-thread in the
 * composer's `ProviderQuotaMeter`.
 */
export function UsagePageContent() {
  const providers = useAtomValue(primaryServerProvidersAtom);
  const environmentId = usePrimaryEnvironmentId();

  const {
    data: usageData,
    isPending,
    refresh,
  } = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.getProviderUsage({ environmentId, input: {} }),
  );

  const weekAgo = useMemo(
    () => new Date(Date.now() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
    // Recalculate only when the component mounts, not every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const { data: weeklyData } = useEnvironmentQuery(
    environmentId === null
      ? null
      : serverEnvironment.getProviderUsage({
          environmentId,
          input: { since: weekAgo },
        }),
  );

  const providersWithQuota = providers.filter(hasVisibleQuota);

  // Build a lookup from instanceId to display name for usage cards.
  const instanceLabels = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of providers) {
      map.set(p.instanceId, p.displayName ?? p.instanceId);
    }
    return map;
  }, [providers]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-2xl px-5 py-6">
        {/* Quota Gauges */}
        {providersWithQuota.length > 0 ? (
          <section>
            <h2 className="mb-3 text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
              Plan Limits
            </h2>
            <div className="flex flex-col gap-3">
              {providersWithQuota.map((provider) => (
                <div
                  key={provider.instanceId}
                  className="rounded-lg border border-border/50 bg-card p-4"
                >
                  <UsageQuotaSummary provider={provider} />
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Token / Cost Usage */}
        <section className={providersWithQuota.length > 0 ? "mt-8" : ""}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-xs font-medium tracking-wide text-muted-foreground/70 uppercase">
              Token Usage
            </h2>
            <button
              type="button"
              className={cn(
                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground/60 transition-colors hover:text-muted-foreground",
                isPending && "animate-spin",
              )}
              onClick={refresh}
              aria-label="Refresh usage data"
            >
              <RefreshCwIcon className={cn("size-3", isPending && "animate-spin")} />
              Refresh
            </button>
          </div>

          {/* Weekly summary */}
          {weeklyData && weeklyData.instances.length > 0 ? (
            <div className="mb-4">
              <div className="mb-2 text-[11px] font-medium text-muted-foreground/60">
                Last 7 days
              </div>
              <div className="flex flex-col gap-2">
                {weeklyData.instances.map((instance) => (
                  <InstanceUsageCard
                    key={`weekly-${instance.instanceId}`}
                    usage={instance}
                    instanceLabel={instanceLabels.get(instance.instanceId) ?? instance.instanceId}
                    driverKind={instance.driver}
                  />
                ))}
              </div>
            </div>
          ) : null}

          {/* All-time summary */}
          {usageData && usageData.instances.length > 0 ? (
            <div>
              <div className="mb-2 text-[11px] font-medium text-muted-foreground/60">All time</div>
              <div className="flex flex-col gap-2">
                {usageData.instances.map((instance) => (
                  <InstanceUsageCard
                    key={`alltime-${instance.instanceId}`}
                    usage={instance}
                    instanceLabel={instanceLabels.get(instance.instanceId) ?? instance.instanceId}
                    driverKind={instance.driver}
                  />
                ))}
              </div>
            </div>
          ) : !isPending ? (
            <div className="rounded-lg border border-border/50 bg-card px-4 py-8 text-center text-sm text-muted-foreground/60">
              No token usage recorded yet.
            </div>
          ) : (
            <div className="rounded-lg border border-border/50 bg-card px-4 py-8 text-center text-sm text-muted-foreground/60">
              Loading usage data…
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
