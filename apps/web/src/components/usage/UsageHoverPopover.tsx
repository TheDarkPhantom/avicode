import type { ServerProvider } from "@t3tools/contracts";
import { useAtomValue } from "@effect/atom-react";
import { GaugeIcon } from "lucide-react";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";

import { primaryServerProvidersAtom } from "~/state/server";
import { filterNonOverageWindows } from "~/lib/providerQuota";
import { Popover, PopoverPopup, PopoverTrigger } from "../ui/popover";
import { SidebarMenuButton } from "../ui/sidebar";
import { UsageQuotaSummary } from "./UsageQuotaSummary";
import { useSidebar } from "../ui/sidebar";

function hasVisibleQuota(provider: ServerProvider): boolean {
  const quota = provider.quota;
  if (!quota || quota.windows.length === 0) return false;
  return filterNonOverageWindows(quota.windows).length > 0;
}

/**
 * Avi Code addition: sidebar Usage entry with a hover popover showing quota
 * gauges for every active credential. Upstream's footer has only Settings;
 * this sits above it so usage is one glance away.
 */
export function UsageHoverPopover() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const providers = useAtomValue(primaryServerProvidersAtom);

  const handleClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/usage" });
  }, [isMobile, navigate, setOpenMobile]);

  const providersWithQuota = providers.filter(hasVisibleQuota);

  return (
    <Popover>
      <PopoverTrigger
        openOnHover
        delay={150}
        closeDelay={0}
        render={
          <SidebarMenuButton onClick={handleClick}>
            <GaugeIcon />
            <span>Usage</span>
          </SidebarMenuButton>
        }
      />
      <PopoverPopup
        tooltipStyle
        side="right"
        align="end"
        className="dropdown-glass w-72 max-w-none border-0! bg-secondary! p-0 shadow-none! before:hidden"
      >
        <div className="flex flex-col gap-3 p-3">
          <div className="text-xs font-medium text-muted-foreground">Provider Usage</div>
          {providersWithQuota.length > 0 ? (
            providersWithQuota.map((provider) => (
              <UsageQuotaSummary key={provider.instanceId} provider={provider} compact />
            ))
          ) : (
            <div className="text-[11px] text-muted-foreground/60">No usage data available.</div>
          )}
        </div>
      </PopoverPopup>
    </Popover>
  );
}
