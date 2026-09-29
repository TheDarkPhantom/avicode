import { effectiveSettled } from "@t3tools/client-runtime/state/thread-settled";
import type { OrchestrationThreadShell } from "@t3tools/contracts";

/**
 * Whether `thread.settle` should restore the thread rather than settle it.
 * Mirrors the SidebarV2 partition: environments without the settlement
 * capability never read as settled, and auto-settle by inactivity counts.
 * The PR-driven auto-settle is left out because PR state lives in the sidebar
 * rows, not in the shell.
 */
export function isThreadSettledForToggle(
  shell: OrchestrationThreadShell,
  options: {
    readonly supportsSettlement: boolean;
    readonly now: string;
    readonly autoSettleAfterDays: number | null;
  },
): boolean {
  if (!options.supportsSettlement) return false;
  return effectiveSettled(shell, {
    now: options.now,
    autoSettleAfterDays: options.autoSettleAfterDays,
    changeRequestState: null,
  });
}
