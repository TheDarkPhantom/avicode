import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { CoinsIcon } from "lucide-react";

import { serverEnvironment } from "~/state/server";
import { useEnvironmentQuery } from "~/state/query";
import { formatQuotaCost, formatTokenCount } from "~/lib/providerQuota";
import { cn } from "~/lib/utils";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";

/**
 * Avi Code addition: compact per-thread token/cost total for the composer
 * footer. Answers "how much has this thread cost" by summing the
 * `provider_instance_usage` rows keyed by this thread.
 *
 * Cost is provider-reported, never estimated: it shows a dollar figure only
 * for drivers that report spend (Claude today) and "—" otherwise, matching the
 * Usage page.
 */
export function ThreadUsageBadge(props: { environmentId: EnvironmentId; threadId: ThreadId }) {
  const { environmentId, threadId } = props;
  const { data } = useEnvironmentQuery(
    serverEnvironment.getThreadUsage({ environmentId, input: { threadId } }),
  );

  const usage = data?.usage ?? null;
  // Nothing to show until the thread has recorded at least one turn's usage.
  if (usage === null || usage.turns === 0) {
    return null;
  }

  const totalTokens = usage.inputTokens + usage.outputTokens;
  const costLabel = formatQuotaCost(usage.costUsd);
  const hasCost = usage.costUsd !== null && usage.costUsd !== undefined;

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-transparent px-2 text-xs text-muted-foreground outline-none transition-colors",
              "hover:bg-accent data-[pressed]:bg-accent",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            )}
            aria-label={`Thread usage: ${formatTokenCount(totalTokens)} tokens${hasCost ? `, ${costLabel}` : ""}`}
          >
            <CoinsIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="tabular-nums">
              {hasCost ? costLabel : `${formatTokenCount(totalTokens)}`}
            </span>
          </button>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="top"
        align="end"
        className="dropdown-glass w-64 max-w-none border-0! bg-secondary! p-0 shadow-none! before:hidden"
      >
        <div className="flex flex-col gap-2 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="font-medium text-muted-foreground text-xs">Thread usage</div>
            <div className="text-[11px] text-muted-foreground/70">{usage.turns} turns</div>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
            <UsageRow label="Input" value={formatTokenCount(usage.inputTokens)} />
            <UsageRow label="Output" value={formatTokenCount(usage.outputTokens)} />
            <UsageRow label="Total" value={formatTokenCount(totalTokens)} />
            <UsageRow label="Cost" value={costLabel} />
          </div>

          {usage.cachedInputTokens > 0 ||
          usage.cacheCreationInputTokens > 0 ||
          usage.reasoningOutputTokens > 0 ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground/50">
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
            <div className="flex flex-col gap-1 border-t border-border/40 pt-2">
              {usage.byModel.map((model) => (
                <div
                  key={model.model ?? "unknown"}
                  className="flex items-center justify-between gap-3 text-[11px]"
                >
                  <span className="truncate text-muted-foreground/80">
                    {model.model ?? "Unknown"}
                  </span>
                  <div className="flex shrink-0 gap-2 tabular-nums text-muted-foreground/60">
                    <span>{formatTokenCount(model.inputTokens + model.outputTokens)}</span>
                    <span>{formatQuotaCost(model.costUsd)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : usage.byModel.length === 1 && usage.byModel[0]?.model ? (
            <div className="text-[11px] text-muted-foreground/50">
              Model: {usage.byModel[0].model}
            </div>
          ) : null}
        </div>
      </PopoverPopup>
    </Popover>
  );
}

function UsageRow(props: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground/60">{props.label}</span>
      <span className="font-medium tabular-nums text-muted-foreground/90">{props.value}</span>
    </div>
  );
}
