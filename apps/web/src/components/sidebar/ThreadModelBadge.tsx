import { useAtomValue } from "@effect/atom-react";
import { memo, useMemo } from "react";

import type { SidebarThreadSummary } from "../../types";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { environmentServerConfigsAtom } from "../../state/server";
import { useClientSettings } from "../../hooks/useSettings";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { getTriggerDisplayModelLabel } from "../chat/providerIconUtils";

export const ThreadModelBadge = memo(function ThreadModelBadge({
  thread,
  className,
}: {
  thread: SidebarThreadSummary;
  className?: string;
}) {
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  const badgeLabels = useClientSettings((settings) => settings.aviCodeProviderBadgeLabels);
  const instanceId = thread.session?.providerInstanceId ?? thread.modelSelection.instanceId;
  const provider = useMemo(
    () =>
      deriveProviderInstanceEntries(serverConfigs.get(thread.environmentId)?.providers ?? []).find(
        (entry) => entry.instanceId === instanceId,
      ) ?? null,
    [instanceId, serverConfigs, thread.environmentId],
  );

  if (!provider) return null;

  const configuredBadge = badgeLabels[instanceId]?.trim().toUpperCase();
  const selectedModel = provider.models.find((model) => model.slug === thread.modelSelection.model);
  const modelLabel = selectedModel
    ? getTriggerDisplayModelLabel(selectedModel)
    : thread.modelSelection.model;
  const tooltip = `${provider.displayName} · ${modelLabel}`;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={tooltip}
            data-testid={`thread-model-badge-${thread.id}`}
            className={className}
          />
        }
      >
        <ProviderInstanceIcon
          driverKind={provider.driverKind}
          displayName={configuredBadge || provider.displayName}
          accentColor={provider.accentColor}
          showBadge
          iconClassName="size-3.5"
          badgeClassName="h-3.5 min-w-3.5 text-[8px]"
          indicatorBackground="var(--sidebar)"
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
});
