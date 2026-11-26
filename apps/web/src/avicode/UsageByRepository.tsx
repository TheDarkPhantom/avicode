import { ProviderDriverKind, type EnvironmentId, type UsageSummaryInput } from "@t3tools/contracts";
import { formatCount, formatTokens, formatUsd } from "@t3tools/shared/usageFormat";
import { T, useGT, useLocale, useMessages } from "gt-react";
import { ChevronRightIcon } from "lucide-react";
import { useState } from "react";

import { ProviderInstanceIcon } from "../components/chat/ProviderInstanceIcon";
import { Skeleton } from "../components/ui/skeleton";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import { cn } from "../lib/utils";
import { useEnvironmentQuery } from "../state/query";
import { projectUsageQuery } from "./projectUsageState";
import {
  repositoryLabel,
  repositoryUsageRows,
  type RepositoryUsageMetric,
  type UsageTotals,
} from "./repositoryUsage";

interface UsageEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
  readonly canReadDiagnostics: boolean;
}

/** Usage per repository, split by provider account and model, for the Usage page's window. */
export function UsageByRepository({
  environments,
  window,
  metric,
}: {
  readonly environments: readonly UsageEnvironment[];
  readonly window: UsageSummaryInput;
  readonly metric: RepositoryUsageMetric;
}) {
  const readable = environments.filter((environment) => environment.canReadDiagnostics);
  if (readable.length === 0) return null;
  const input = {
    sinceDay: window.sinceDay,
    untilDay: window.untilDay,
    timeZone: window.timeZone,
    ...(window.sinceTime === undefined || window.untilTime === undefined
      ? {}
      : { sinceTime: window.sinceTime, untilTime: window.untilTime }),
  };
  return (
    <section className="mt-6 flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium text-foreground">
          <T>By repository</T>
        </h2>
        <p className="text-xs text-muted-foreground">
          <T>
            Includes history from the first Avi Code. Costs are API estimates unless the provider
            reported them.
          </T>
        </p>
      </div>
      {readable.map((environment) => (
        <EnvironmentRepositories
          key={environment.environmentId}
          environmentId={environment.environmentId}
          label={readable.length > 1 ? environment.label : null}
          input={input}
          metric={metric}
        />
      ))}
    </section>
  );
}

function EnvironmentRepositories({
  environmentId,
  label,
  input,
  metric,
}: {
  readonly environmentId: EnvironmentId;
  readonly label: string | null;
  readonly input: Parameters<typeof projectUsageQuery>[0]["input"];
  readonly metric: RepositoryUsageMetric;
}) {
  const gt = useGT();
  const m = useMessages();
  const locale = useLocale();
  const query = useEnvironmentQuery(projectUsageQuery({ environmentId, input }), m);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  const costCell = (totals: UsageTotals) =>
    totals.costUsd === null ? (
      <span className="text-muted-foreground">
        <T>Unreported</T>
      </span>
    ) : totals.unpricedTurns === 0 ? (
      formatUsd(totals.costUsd, locale)
    ) : (
      <Tooltip>
        <TooltipTrigger render={<span />}>{`${formatUsd(totals.costUsd, locale)}*`}</TooltipTrigger>
        <TooltipPopup side="top">
          {gt(
            "{count, plural, one {{count} turn has no cost} other {{count} turns have no cost}}",
            { count: totals.unpricedTurns },
          )}
        </TooltipPopup>
      </Tooltip>
    );

  if (query.data === null) {
    if (query.error !== null) {
      return <p className="text-sm text-muted-foreground">{query.error}</p>;
    }
    return <Skeleton className="h-24 w-full" />;
  }

  const rows = repositoryUsageRows(query.data, metric);
  return (
    <div className={cn("flex flex-col gap-1", query.isPending && "opacity-60")}>
      {label === null ? null : <h3 className="text-xs text-muted-foreground">{label}</h3>}
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-right text-xs text-muted-foreground">
            <th className="w-full py-2 pl-2 text-left font-normal">
              <T>Repository</T>
            </th>
            <th className="py-2 pl-6 font-normal">
              <T>Cost</T>
            </th>
            <th className="py-2 pl-6 font-normal">
              <T>Tokens</T>
            </th>
            <th className="hidden py-2 pr-2 pl-6 font-normal sm:table-cell">
              <T>Turns</T>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={4} className="py-6 text-center text-muted-foreground">
                <T>No activity in this window.</T>
              </td>
            </tr>
          ) : (
            rows.flatMap((row) => {
              const isOpen = expanded.has(row.key);
              const name = repositoryLabel(row) ?? gt("Unknown repository");
              const figures = (totals: UsageTotals) => (
                <>
                  <td className="py-2 pl-6 text-foreground">{costCell(totals)}</td>
                  <td className="py-2 pl-6">{formatTokens(totals.tokens)}</td>
                  <td className="hidden py-2 pr-2 pl-6 sm:table-cell">
                    {formatCount(totals.turns, locale)}
                  </td>
                </>
              );
              const repositoryRow = (
                <tr
                  key={row.key}
                  className="relative border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums transition-colors hover:bg-muted/50 has-focus-visible:bg-muted/50"
                >
                  <td className="py-2 pl-2 text-left whitespace-normal">
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => toggle(row.key)}
                      className="flex items-center gap-1.5 text-left text-foreground outline-none after:absolute after:inset-0"
                    >
                      <ChevronRightIcon
                        aria-hidden
                        className={cn(
                          "size-3.5 shrink-0 text-muted-foreground",
                          isOpen && "rotate-90",
                        )}
                      />
                      {name}
                    </button>
                  </td>
                  {figures(row)}
                </tr>
              );
              if (!isOpen) return [repositoryRow];
              return [
                repositoryRow,
                ...row.accounts.flatMap((account) => [
                  <tr
                    key={`${row.key}\0${account.providerInstanceId}\0${account.driver}`}
                    className="border-b border-border/50 text-right whitespace-nowrap text-muted-foreground tabular-nums"
                  >
                    <td className="py-2 pl-8 text-left text-foreground">
                      <span className="flex items-center gap-2">
                        <ProviderInstanceIcon
                          driverKind={ProviderDriverKind.make(account.driver)}
                          displayName={account.providerInstanceId}
                          iconClassName="size-3.5"
                        />
                        {account.providerInstanceId}
                      </span>
                    </td>
                    {figures(account)}
                  </tr>,
                  ...account.models.map((model) => (
                    <tr
                      key={`${row.key}\0${account.providerInstanceId}\0${account.driver}\0${model.model ?? ""}`}
                      className="border-b border-border/50 text-right text-xs whitespace-nowrap text-muted-foreground tabular-nums"
                    >
                      <td className="py-1.5 pl-14 text-left">
                        {model.model ?? gt("Unknown model")}
                      </td>
                      {figures(model)}
                    </tr>
                  )),
                ]),
              ];
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
