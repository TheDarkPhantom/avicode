import type { AviCodeSendWhileRunning } from "@t3tools/contracts/settings";

/**
 * Avi Code addition: decides what a send does while the agent is still working.
 *
 * Upstream has exactly one behaviour — the message is injected into the running
 * turn immediately (steering). That is right when the message corrects the work
 * in flight and wrong when it is simply the next instruction, which arrives at
 * the running turn as an interruption nobody asked for.
 *
 * A held send is captured in full at this point: the commands are built and
 * parked in `heldTurnStore`, and the composer is emptied. That capture is the
 * whole point. The first version held nothing but a flag and re-read the
 * composer when the turn settled, so a draft still being typed was sent
 * half-finished and its remainder became the next message. The cost of the
 * capture is that a hold does not survive a reload, which the banner says out
 * loud.
 */
export function shouldHoldSendWhileRunning(input: {
  readonly setting: AviCodeSendWhileRunning;
  readonly phase: string | null | undefined;
}): boolean {
  if (input.setting !== "queue") return false;
  return input.phase === "running";
}

/**
 * A held send flushes only into the thread it was held for, and only once that
 * thread is genuinely free. Navigating away pauses the flush rather than
 * cancelling it: the hold is per-thread, so coming back resumes it.
 *
 * `hasPendingUserInput` is not a nicety. A flush routed through the composer's
 * send path lands on the pending-question branch first, which answers the
 * questionnaire with whatever is drafted and returns — the questionnaire
 * resolves from a message the user never aimed at it, and the held message is
 * consumed without ever being sent.
 */
export function shouldFlushHeldSend(input: {
  readonly heldThreadKeys: ReadonlyArray<string>;
  readonly activeThreadKey: string | null;
  readonly phase: string | null | undefined;
  readonly isSendBusy: boolean;
  readonly isConnecting: boolean;
  readonly hasPendingUserInput: boolean;
  readonly environmentUnavailable: boolean;
}): boolean {
  if (input.activeThreadKey === null) return false;
  if (!input.heldThreadKeys.includes(input.activeThreadKey)) return false;
  if (input.isSendBusy || input.isConnecting) return false;
  if (input.hasPendingUserInput) return false;
  // Dispatching into a dropped connection would only fail. The hold keeps.
  if (input.environmentUnavailable) return false;
  return input.phase !== "running";
}
