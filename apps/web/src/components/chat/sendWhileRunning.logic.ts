import type { AviCodeSendWhileRunning } from "@t3tools/contracts/settings";

/**
 * Avi Code addition: decides what a send does while the agent is still working.
 *
 * Upstream has exactly one behaviour — the message is injected into the running
 * turn immediately (steering). That is right when the message corrects the work
 * in flight and wrong when it is simply the next instruction, which arrives at
 * the running turn as an interruption nobody asked for.
 *
 * The hold is deliberately client-side and holds nothing but a flag: the
 * composer keeps the user's own draft, attachments and contexts untouched, and
 * the flush just re-runs the same send once the turn settles. That is why there
 * is no serialization here and no new command, event or migration — all of
 * which orchestration V2 would throw away. The cost is that a held send does
 * not survive a reload, which the banner says out loud.
 */
export function shouldHoldSendWhileRunning(input: {
  readonly setting: AviCodeSendWhileRunning;
  readonly phase: string | null | undefined;
  /** True when the caller is the "Send now" action, which must always win. */
  readonly bypassHold: boolean;
}): boolean {
  if (input.bypassHold) return false;
  if (input.setting !== "queue") return false;
  return input.phase === "running";
}

/**
 * A held send flushes only into the thread it was held for, and only once that
 * thread is genuinely free. Navigating away pauses the flush rather than
 * cancelling it: the draft is per-thread, so coming back resumes it with the
 * same content.
 */
export function shouldFlushHeldSend(input: {
  readonly heldThreadKeys: ReadonlyArray<string>;
  readonly activeThreadKey: string | null;
  readonly phase: string | null | undefined;
  readonly isSendBusy: boolean;
  readonly isConnecting: boolean;
}): boolean {
  if (input.activeThreadKey === null) return false;
  if (!input.heldThreadKeys.includes(input.activeThreadKey)) return false;
  if (input.isSendBusy || input.isConnecting) return false;
  return input.phase !== "running";
}

export function addHeldSend(
  heldThreadKeys: ReadonlyArray<string>,
  threadKey: string,
): ReadonlyArray<string> {
  return heldThreadKeys.includes(threadKey) ? heldThreadKeys : [...heldThreadKeys, threadKey];
}

export function removeHeldSend(
  heldThreadKeys: ReadonlyArray<string>,
  threadKey: string,
): ReadonlyArray<string> {
  return heldThreadKeys.includes(threadKey)
    ? heldThreadKeys.filter((key) => key !== threadKey)
    : heldThreadKeys;
}
