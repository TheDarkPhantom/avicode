import type { RightPanelSeparatorHandlers } from "~/hooks/useRightPanelSplitLayout";
import { cn } from "~/lib/utils";

interface Props {
  handlers: RightPanelSeparatorHandlers;
  value: number;
  minimum: number;
  maximum: number;
  active: boolean;
  className?: string;
}

/**
 * Hit target for resizing a right-anchored panel via its left edge.
 *
 * - Sits on top of the panel's border with a 4px overlap on each side so the
 *   user can grab a few pixels off the edge without aiming.
 * - Visual indicator is a 1px line that lights up on hover/active to mirror
 *   VS Code / Cursor.
 */
export function RightPanelResizeHandle({
  handlers,
  value,
  minimum,
  maximum,
  active,
  className,
}: Props) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat and side panel"
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      tabIndex={0}
      data-active={active ? "true" : "false"}
      className={cn(
        "group absolute inset-y-0 -left-1.5 z-20 w-3 cursor-col-resize select-none outline-none",
        "focus-visible:[&_span]:bg-primary/80 focus-visible:[&_span]:shadow-[0_0_0_1px_var(--primary)]",
        className,
      )}
      {...handlers}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-transparent transition-colors duration-150 group-hover:bg-border group-data-[active=true]:bg-primary/70 motion-reduce:transition-none"
      />
    </div>
  );
}
