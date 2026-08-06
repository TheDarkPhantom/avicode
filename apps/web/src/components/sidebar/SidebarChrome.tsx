import { ScrollTextIcon, SettingsIcon } from "lucide-react";
import { memo, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";

import { useEnvironmentIdentificationMode } from "../../hooks/useSettings";
import { cn } from "../../lib/utils";
import {
  resolveEnvironmentIdentificationPillLabel,
  resolveSidebarStageBackdropVariant,
  SidebarStageBackdrop,
  useEnvironmentStageLabel,
} from "../SidebarStageBackdrop";
import { Badge } from "../ui/badge";
import { APP_BASE_NAME } from "../../branding";
import {
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "../ui/sidebar";
import { SidebarProviderUpdatePill } from "./SidebarProviderUpdatePill";
import { SidebarUpdatePill } from "./SidebarUpdatePill";
// Avi Code addition: sidebar Usage entry with hover popover for quota gauges.
import { UsageHoverPopover } from "../usage/UsageHoverPopover";

export const SidebarChromeHeader = memo(function SidebarChromeHeader({
  isElectron,
}: {
  isElectron: boolean;
}) {
  const stageLabel = useEnvironmentStageLabel();
  const environmentIdentificationMode = useEnvironmentIdentificationMode();
  const backdropVariant = resolveSidebarStageBackdropVariant(
    stageLabel,
    environmentIdentificationMode === "artwork",
  );
  const pillLabel =
    environmentIdentificationMode === "pill"
      ? resolveEnvironmentIdentificationPillLabel(stageLabel)
      : null;

  return (
    <SidebarHeader
      className={cn(
        "@container/sidebar-header relative h-[var(--workspace-topbar-height)] shrink-0 flex-row items-center px-3 py-0 md:px-0",
        isElectron && "drag-region",
      )}
    >
      {backdropVariant ? <SidebarStageBackdrop variant={backdropVariant} /> : null}
      <SidebarTrigger
        className={cn(
          "relative z-10 md:hidden",
          backdropVariant &&
            "[:hover,[data-pressed]]:bg-white/15 focus-visible:ring-white/90 focus-visible:ring-offset-blue-700 [&_svg]:stroke-white/90! [&_svg]:opacity-100! [&_svg]:hover:stroke-white!",
        )}
      />
      <SidebarBrand onBackdrop={backdropVariant !== null} />
      {pillLabel ? (
        <Badge
          className="relative z-10 ml-1 rounded-full px-1.5 text-muted-foreground"
          data-environment-identification="pill"
          size="sm"
          variant="secondary"
        >
          {pillLabel}
        </Badge>
      ) : null}
    </SidebarHeader>
  );
});

function SidebarBrand({ onBackdrop }: { onBackdrop: boolean }) {
  return (
    <Link
      aria-label="Go to threads"
      className={cn(
        "sidebar-brand relative z-10 ml-[var(--workspace-titlebar-content-left)] h-7 w-fit min-w-0 shrink-0 items-center gap-1 overflow-hidden rounded-md outline-hidden ring-ring focus-visible:ring-2",
        onBackdrop ? "text-white" : "text-foreground",
      )}
      to="/"
    >
      <AviCodeMark />
      <span
        className={cn(
          "truncate text-sm font-semibold tracking-[-0.02em]",
          onBackdrop ? "text-white/85" : "text-foreground",
        )}
      >
        {APP_BASE_NAME}
      </span>
    </Link>
  );
}

function AviCodeMark() {
  return (
    <svg
      aria-label="Avi Code"
      className="h-5 w-5 shrink-0"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="24" height="24" rx="7" fill="#0C0A0A" />
      <path
        d="M5.1 17.9 10.25 5.8h3.5l5.15 12.1h-3.45l-.9-2.3h-5.2l-.9 2.3H5.1Zm5.22-4.88h3.26L11.95 8.8l-1.63 4.22Z"
        fill="#DE5257"
      />
      <circle cx="17.85" cy="6.15" r="1.45" fill="#C99A2E" />
    </svg>
  );
}

export const SidebarChromeFooter = memo(function SidebarChromeFooter() {
  const navigate = useNavigate();
  const { isMobile, setOpenMobile } = useSidebar();
  const handleSettingsClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/settings" });
  }, [isMobile, navigate, setOpenMobile]);
  // Avi Code addition: upstream's footer ends at Settings. The fork merges upstream regularly, so
  // the changelog — which separates fork work from what a sync brought in — sits one click away.
  const handleChangelogClick = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
    void navigate({ to: "/changelog" });
  }, [isMobile, navigate, setOpenMobile]);

  return (
    <SidebarFooter className="p-2">
      <SidebarProviderUpdatePill />
      <SidebarUpdatePill />
      <SidebarMenu>
        {/* Avi Code addition: Usage entry above Settings for at-a-glance quota
            gauges on hover and a full usage page on click. */}
        <SidebarMenuItem>
          <UsageHoverPopover />
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleSettingsClick}>
            <SettingsIcon />
            <span>Settings</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
        <SidebarMenuItem>
          <SidebarMenuButton onClick={handleChangelogClick}>
            <ScrollTextIcon />
            <span>Changelog</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
});
