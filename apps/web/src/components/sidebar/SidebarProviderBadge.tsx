/**
 * Avi Code addition: sidebar-specific provider badge that separates the
 * provider icon from the instance identity label for at-a-glance scanning.
 *
 * Upstream's ProviderInstanceIcon overlays a tiny badge on the provider logo,
 * making both hard to read at sidebar scale. This component lays the two
 * signals side-by-side: the provider SVG icon (Claude/OpenAI/etc.) stands
 * alone at readable size, and the instance initials sit in a small
 * accent-colored pill next to it.
 */
import { memo, type CSSProperties } from "react";
import type { ProviderDriverKind } from "@t3tools/contracts";

import { PROVIDER_ICON_BY_PROVIDER } from "../chat/providerIconUtils";
import { providerInstanceInitials } from "../chat/ProviderInstanceIcon";
import { cn } from "~/lib/utils";

export const SidebarProviderBadge = memo(function SidebarProviderBadge(props: {
  driverKind: ProviderDriverKind;
  displayName: string;
  badgeLabel?: string;
  accentColor?: string;
  className?: string;
}) {
  const Icon = PROVIDER_ICON_BY_PROVIDER[props.driverKind] ?? null;
  const initials = props.badgeLabel || providerInstanceInitials(props.displayName);

  return (
    <span className={cn("inline-flex shrink-0 items-center gap-0.5", props.className)}>
      {Icon ? <Icon className="size-4 shrink-0" aria-hidden /> : null}
      <span
        className={cn(
          "inline-flex h-3.5 items-center justify-center rounded-sm px-0.5 text-[7px] font-bold leading-none",
          props.accentColor ? "text-white" : "bg-muted text-muted-foreground",
        )}
        style={
          props.accentColor ? ({ backgroundColor: props.accentColor } as CSSProperties) : undefined
        }
        aria-hidden
      >
        {initials}
      </span>
    </span>
  );
});
