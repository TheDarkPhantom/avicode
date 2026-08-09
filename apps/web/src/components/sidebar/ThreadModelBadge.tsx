import { useAtomValue } from "@effect/atom-react";
import { memo, useMemo } from "react";

import type { SidebarThreadSummary } from "../../types";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import { environmentServerConfigsAtom } from "../../state/server";
import { useClientSettings } from "../../hooks/useSettings";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { getTriggerDisplayModelLabel } from "../chat/providerIconUtils";
import { SidebarProviderBadge } from "./SidebarProviderBadge";

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
        <SidebarProviderBadge
          driverKind={provider.driverKind}
          displayName={provider.displayName}
          {...(configuredBadge ? { badgeLabel: configuredBadge } : null)}
          {...(provider.accentColor ? { accentColor: provider.accentColor } : null)}
        />
      </TooltipTrigger>
      <TooltipPopup side="top">{tooltip}</TooltipPopup>
    </Tooltip>
  );
});
