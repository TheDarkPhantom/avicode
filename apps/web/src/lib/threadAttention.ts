import { hasUnseenCompletion } from "../components/Sidebar.logic";
import type { SidebarThreadSummary } from "../types";

/**
 * The states in which a thread is waiting on the user rather than on itself.
 *
 * Deliberately a subset of, and derived from, the sidebar status model: the
 * chime is supposed to mean "one of those labels just appeared", so anything
 * that changes what the sidebar shows has to change this too. `approval` and
 * `input` are the sidebar's Pending Approval / Awaiting Input; `done` is the
 * unread-completion state the sidebar labels Completed (v1) or Done (v2).
 *
 * Working, Connecting, Plan Ready, Failed and Needs Resume are intentionally
 * absent — the first two are the agent's problem, not the user's, and the
 * others were left out of the audible set by choice.
 */
export type ThreadAttentionKind = "approval" | "input" | "done";

export type ThreadAttentionInput = Pick<
  SidebarThreadSummary,
  | "hasActionableProposedPlan"
  | "hasPendingApprovals"
  | "hasPendingUserInput"
  | "interactionMode"
  | "latestTurn"
  | "session"
>;

/**
 * Which attention state a thread is in, or null when it wants nothing.
 *
 * Precedence matches `resolveThreadStatusPill` / `resolveSidebarV2Status`:
 * a blocked agent (approval, then input) outranks everything including a live
 * session, and a live session outranks an unread completion — a thread that
 * has started working again is not waiting on anybody, even if its previous
 * turn was never read.
 */
export function resolveThreadAttention(
  thread: ThreadAttentionInput,
  lastVisitedAt: string | undefined,
): ThreadAttentionKind | null {
  if (thread.hasPendingApprovals) return "approval";
  if (thread.hasPendingUserInput) return "input";
  if (thread.session?.status === "running" || thread.session?.status === "starting") return null;
  if (hasUnseenCompletion({ ...thread, lastVisitedAt })) return "done";
  return null;
}

export type ThreadAttentionSnapshot = ReadonlyMap<string, ThreadAttentionKind | null>;

/**
 * The thread keys that just entered an attention state and should be heard.
 *
 * Two rules keep this quiet in the cases that matter:
 *
 * A thread absent from `previous` never chimes. First observation is not a
 * transition — without this, connecting a second environment (or reloading the
 * page) would dump its whole backlog of unread threads into one burst of
 * sound.
 *
 * `suppressedThreadKey` is the thread the user is demonstrably already looking
 * at. Its new state is still recorded, so navigating away later does not
 * produce a delayed chime for something already seen.
 */
export function resolveAttentionChimes(input: {
  readonly previous: ThreadAttentionSnapshot;
  readonly current: ThreadAttentionSnapshot;
  readonly suppressedThreadKey: string | null;
}): readonly string[] {
  const chimes: string[] = [];
  for (const [threadKey, kind] of input.current) {
    if (kind === null) continue;
    if (threadKey === input.suppressedThreadKey) continue;
    if (!input.previous.has(threadKey)) continue;
    if (input.previous.get(threadKey) === kind) continue;
    chimes.push(threadKey);
  }
  return chimes;
}
