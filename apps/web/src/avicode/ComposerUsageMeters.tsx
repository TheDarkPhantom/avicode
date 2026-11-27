import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import type { ContextWindowSnapshot } from "@t3tools/client-runtime/state/context-window";
import { formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { useGT, useLocale, useMessages } from "gt-react";
import { CoinsIcon, Minimize2Icon } from "lucide-react";
import { useEffect, useRef, type ReactElement, type ReactNode } from "react";

import { formatContextWindowCompactionMessage } from "../components/chat/compaction.logic";
import {
  type ThreadDetailsUsageInput,
  ThreadDetailsUsage,
} from "../components/chat/ThreadDetailsUsage";
import {
  resolveThreadDetailsLimits,
  resolveThreadHttpQuotas,
} from "../components/chat/ThreadDetailsUsage.logic";
import { Button } from "../components/ui/button";
import { Popover, PopoverPopup, PopoverTrigger } from "../components/ui/popover";
import { useNowMinute } from "../hooks/useNowMinute";
import { formatContextWindowTokens } from "../lib/contextWindow";
import { cn } from "../lib/utils";
import { useEnvironmentQuery } from "../state/query";
import {
  contextUsedTone,
  limitLeftTone,
  type MeterTone,
  threadUsageTotals,
  limitWindowsLeft,
} from "./composerUsageMeters.logic";
import { threadUsageQuery } from "./threadUsageState";

export interface ComposerUsageMetersProps {
  readonly environmentId: EnvironmentId;
  /** Null for a draft the server has not created yet. */
  readonly threadId: ThreadId | null;
  /** Changes when a run starts or settles, so the thread total re-reads. */
  readonly runRevision: string;
  readonly contextWindow: ContextWindowSnapshot | null;
  readonly onCompact: () => void;
  readonly compactDisabled: boolean;
  readonly usage: Omit<ThreadDetailsUsageInput, "contextWindow">;
}

/** Context window, thread cost and provider limits, beside the composer's attach button. */
export function ComposerUsageMeters(props: ComposerUsageMetersProps) {
  return (
    <div data-avicode-usage-meters className="flex shrink-0 items-center">
      {props.contextWindow ? (
        <ContextWindowMeter
          usage={props.contextWindow}
          onCompact={props.onCompact}
          compactDisabled={props.compactDisabled}
        />
      ) : null}
      {props.threadId ? (
        <ThreadUsageBadge
          // A new thread starts with a fresh revision baseline.
          key={`${props.environmentId}:${props.threadId}`}
          environmentId={props.environmentId}
          threadId={props.threadId}
          runRevision={props.runRevision}
        />
      ) : null}
      <ProviderQuotaMeter {...props.usage} />
    </div>
  );
}

function HoverCard(props: {
  readonly trigger: ReactElement;
  /** What the trigger shows. */
  readonly face: ReactNode;
  readonly children: ReactNode;
  /** Leaves time to reach a button inside the card. */
  readonly interactive?: boolean;
}) {
  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={props.interactive ? 200 : 0}
        render={props.trigger}
      >
        {props.face}
      </PopoverTrigger>
      <PopoverPopup side="top" align="start" width="sm" padding="compact">
        {props.children}
      </PopoverPopup>
    </Popover>
  );
}

const RING_RADIUS = 9.75;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function MeterRing({ fill, tone }: { readonly fill: number; readonly tone: MeterTone }) {
  const clamped = Math.max(0, Math.min(100, fill));
  return (
    <svg viewBox="0 0 24 24" className="size-4 -rotate-90" aria-hidden>
      <circle
        cx="12"
        cy="12"
        r={RING_RADIUS}
        fill="none"
        strokeWidth="3"
        className="stroke-muted-foreground/25"
      />
      {clamped > 0 ? (
        <circle
          cx="12"
          cy="12"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_CIRCUMFERENCE}
          strokeDashoffset={RING_CIRCUMFERENCE - (clamped / 100) * RING_CIRCUMFERENCE}
          className={cn(
            tone === "error"
              ? "stroke-error"
              : tone === "warning"
                ? "stroke-warning"
                : "stroke-muted-foreground",
          )}
        />
      ) : null}
    </svg>
  );
}

const toneText = (tone: MeterTone) =>
  tone === "error" ? "text-error-foreground" : tone === "warning" ? "text-warning-foreground" : "";

function MeterBar({ fill, tone }: { readonly fill: number; readonly tone: MeterTone }) {
  return (
    <div className="h-1 overflow-hidden rounded-full bg-muted-foreground/20">
      <div
        className={cn(
          "h-full rounded-full",
          tone === "error" ? "bg-error" : tone === "warning" ? "bg-warning" : "bg-muted-foreground",
        )}
        style={{ width: `${Math.max(0, Math.min(100, fill))}%` }}
      />
    </div>
  );
}

function CardRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

function ContextWindowMeter(props: {
  readonly usage: ContextWindowSnapshot;
  readonly onCompact: () => void;
  readonly compactDisabled: boolean;
}) {
  const gt = useGT();
  const m = useMessages();
  const { usage } = props;
  const maxTokens = usage.maxTokens != null && usage.maxTokens > 0 ? usage.maxTokens : null;
  const used =
    maxTokens !== null && usage.usedPercentage !== null
      ? Math.round(Math.max(0, Math.min(100, usage.usedPercentage)))
      : null;
  const usedTokens = formatContextWindowTokens(usage.usedTokens);
  const tone = used === null ? null : contextUsedTone(used);
  const threshold = usage.autoCompactThreshold ?? null;
  return (
    <HoverCard
      interactive
      face={<MeterRing fill={used ?? 0} tone={tone} />}
      trigger={
        <Button
          type="button"
          variant="ghost-muted"
          size="icon-sm"
          aria-label={
            used !== null
              ? gt("Context window: {used}% used", { used })
              : gt("Context window: {usedTokens} tokens used", { usedTokens })
          }
        />
      }
    >
      <div className="flex flex-col gap-2 py-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-muted-foreground">{gt("Context window")}</span>
          <span className="tabular-nums text-muted-foreground">
            {maxTokens !== null && used !== null
              ? `${used}% · ${usedTokens} / ${formatContextWindowTokens(maxTokens)}`
              : usedTokens}
          </span>
        </div>
        {used !== null ? <MeterBar fill={used} tone={tone} /> : null}
        {threshold !== null && threshold > 0 ? (
          <p className="text-pretty text-muted-foreground">
            {formatContextWindowCompactionMessage(threshold, m)}
          </p>
        ) : null}
        <div className="grid">
          <Button
            type="button"
            variant="outline"
            size="xs"
            disabled={props.compactDisabled}
            onClick={props.onCompact}
          >
            <Minimize2Icon aria-hidden />
            {gt("Compact context")}
          </Button>
        </div>
      </div>
    </HoverCard>
  );
}

function ThreadUsageBadge(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly runRevision: string;
}) {
  const gt = useGT();
  const locale = useLocale();
  const { data, refresh } = useEnvironmentQuery(
    threadUsageQuery({ environmentId: props.environmentId, input: { threadId: props.threadId } }),
  );
  const seenRevision = useRef(props.runRevision);
  // oxlint-disable-next-line t3code/no-unreasoned-state-sync -- re-reads the server's thread total after a run starts or settles
  useEffect(() => {
    if (seenRevision.current === props.runRevision) return;
    seenRevision.current = props.runRevision;
    refresh();
  }, [props.runRevision, refresh]);

  const totals = data ? threadUsageTotals(data.entries) : null;
  if (totals === null) return null;
  const tokens = formatTokens(totals.inputTokens + totals.outputTokens);
  const cost = totals.costUsd === null ? null : formatUsd(totals.costUsd, locale);
  return (
    <HoverCard
      face={
        <>
          <CoinsIcon aria-hidden />
          <span className="tabular-nums">{cost ?? tokens}</span>
        </>
      }
      trigger={
        <Button
          type="button"
          variant="ghost-muted"
          size="xs"
          aria-label={
            cost === null
              ? gt("Thread usage: {tokens} tokens", { tokens })
              : gt("Thread usage: {tokens} tokens, about {cost}", { tokens, cost })
          }
        />
      }
    >
      <div className="flex flex-col gap-1.5 py-1 text-xs">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium text-muted-foreground">{gt("Thread usage")}</span>
          <span className="text-muted-foreground">
            {gt("{count, plural, one {{count} turn} other {{count} turns}}", {
              count: totals.turns,
            })}
          </span>
        </div>
        <CardRow
          label={gt("Input", { $context: "input tokens" })}
          value={formatTokens(totals.inputTokens)}
        />
        {totals.cachedInputTokens > 0 ? (
          <CardRow label={gt("Cache reads")} value={formatTokens(totals.cachedInputTokens)} />
        ) : null}
        {totals.cacheCreationTokens > 0 ? (
          <CardRow label={gt("Cache writes")} value={formatTokens(totals.cacheCreationTokens)} />
        ) : null}
        <CardRow
          label={gt("Output", { $context: "output tokens" })}
          value={formatTokens(totals.outputTokens)}
        />
        <CardRow label={gt("Estimated cost")} value={cost ?? "-"} />
        {totals.unpricedTurns > 0 ? (
          <p className="text-pretty text-muted-foreground">
            {gt(
              "{count, plural, one {{count} turn has no known price and is left out of the cost.} other {{count} turns have no known price and are left out of the cost.}}",
              { count: totals.unpricedTurns },
            )}
          </p>
        ) : null}
      </div>
    </HoverCard>
  );
}

function ProviderQuotaMeter(usage: Omit<ThreadDetailsUsageInput, "contextWindow">) {
  const gt = useGT();
  const nowMinute = useNowMinute();
  const now = Date.parse(`${nowMinute}:00Z`);
  const resolved = resolveThreadDetailsLimits(
    usage.providerInstanceId,
    usage.model,
    usage.providers,
    usage.sources,
    now,
  );
  const quotas = resolveThreadHttpQuotas(usage.providerInstanceId, usage.sources);
  const lefts = limitWindowsLeft(
    resolved,
    quotas.map((quota) => quota.window),
  );
  if (lefts.length === 0) return null;
  const left = Math.min(...lefts);
  // Like the first Avi Code: the first two windows' room left, such as session and weekly.
  const [first = left, second] = lefts;
  return (
    <HoverCard
      interactive
      face={
        <span className="tabular-nums">
          <span className={toneText(limitLeftTone(first))}>
            {second === undefined ? `${first}%` : first}
          </span>
          {second === undefined ? null : (
            <>
              <span className="text-muted-foreground/50">/</span>
              <span className={toneText(limitLeftTone(second))}>{second}</span>
            </>
          )}
        </span>
      }
      trigger={
        <Button
          type="button"
          variant="ghost-muted"
          size="xs"
          aria-label={gt("Usage limits: {left}% left", { left })}
        />
      }
    >
      <ThreadDetailsUsage {...usage} />
    </HoverCard>
  );
}
