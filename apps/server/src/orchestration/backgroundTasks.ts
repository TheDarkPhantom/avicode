/**
 * Avi Code addition: pending provider background tasks per thread.
 *
 * Claude can background a command or subagent and end its turn; when the task
 * finishes the provider wakes the agent for another turn. The projection keeps
 * the ids of tasks started (`task.started` activity) and not yet finished
 * (`task.completed` activity) so the sidebar can say Waiting instead of
 * Completed in between.
 */
import type { OrchestrationSessionStatus, OrchestrationThreadActivity } from "@t3tools/contracts";

function activityTaskId(activity: Pick<OrchestrationThreadActivity, "payload">): string | null {
  const payload = activity.payload;
  if (payload === null || typeof payload !== "object") return null;
  const taskId = (payload as { readonly taskId?: unknown }).taskId;
  return typeof taskId === "string" && taskId.length > 0 ? taskId : null;
}

/** Folds one thread activity into the pending task id set. Idempotent. */
export function applyBackgroundTaskActivity(
  ids: ReadonlyArray<string>,
  activity: Pick<OrchestrationThreadActivity, "kind" | "payload">,
): ReadonlyArray<string> {
  if (activity.kind !== "task.started" && activity.kind !== "task.completed") return ids;
  const taskId = activityTaskId(activity);
  if (taskId === null) return ids;
  if (activity.kind === "task.started") {
    return ids.includes(taskId) ? ids : [...ids, taskId];
  }
  return ids.includes(taskId) ? ids.filter((id) => id !== taskId) : ids;
}

/**
 * Statuses that mean the provider process (and every task it ran) is gone. A
 * new user turn moves through `starting`/`running`, and background tasks keep
 * running across turns, so those keep the set.
 */
export function sessionStatusClearsBackgroundTasks(status: OrchestrationSessionStatus): boolean {
  return status === "stopped" || status === "error" || status === "interrupted";
}

/** Shell field, present only when something is pending to keep payloads small. */
export function pendingBackgroundTasksShellField(ids: ReadonlyArray<string> | undefined): {
  readonly hasPendingBackgroundTasks?: true;
} {
  return (ids?.length ?? 0) > 0 ? { hasPendingBackgroundTasks: true } : {};
}
