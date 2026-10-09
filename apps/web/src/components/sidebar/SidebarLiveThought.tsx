import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { memo, type ReactNode } from "react";

import { cn } from "../../lib/utils";
import { useThreadLiveThought } from "../../state/threadLiveThoughts";

/**
 * Avi Code addition: one muted line with the agent's latest thought, for a
 * running thread's sidebar row. Render it only while the thread is running;
 * the subscription lives here so a new line re-renders this text, not the row.
 * Static text, truncated to one line. Providers without thoughts show
 * `fallback` (nothing by default).
 */
export const SidebarLiveThought = memo(function SidebarLiveThought(props: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly className?: string;
  readonly fallback?: ReactNode;
}) {
  const line = useThreadLiveThought(props.environmentId, props.threadId);
  if (line === null) return props.fallback ?? null;
  return <SidebarLiveThoughtText line={line} className={props.className} />;
});

export function SidebarLiveThoughtText(props: {
  readonly line: string;
  readonly className?: string | undefined;
}) {
  return (
    <span
      data-testid="sidebar-live-thought"
      title={props.line}
      className={cn("block min-w-0 truncate text-muted-foreground/70", props.className)}
    >
      {props.line}
    </span>
  );
}
