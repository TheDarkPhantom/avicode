import type { ProviderInteractionMode } from "@t3tools/contracts";

import { DEFAULT_INTERACTION_MODE } from "./types";

/**
 * Avi Code addition. Interaction mode for a brand-new chat. Upstream hardcodes
 * `DEFAULT_INTERACTION_MODE` ("default"); this honours the
 * `aviCodeNewThreadsStartInPlanMode` setting so users can make every new chat
 * open in plan mode. Only new-draft creation paths use this — restored drafts
 * and existing threads keep the mode they already carry.
 *
 * The setting is read through a registered callback rather than an import of
 * `hooks/useSettings`: this module is reached from `composerDraftStore`, which
 * `connection/platform` loads at startup, and importing `useSettings` from
 * that graph creates a module cycle through `state/server`. Until
 * `hooks/useSettings` registers the live reader, the upstream default applies.
 */
let readStartInPlanMode: () => boolean = () => false;

export function registerStartInPlanModeReader(reader: () => boolean): void {
  readStartInPlanMode = reader;
}

export function resolveInitialInteractionMode(): ProviderInteractionMode {
  return readStartInPlanMode() ? "plan" : DEFAULT_INTERACTION_MODE;
}

/**
 * Avi Code addition. The mode a new chat opens in, given the mode carried over
 * from the chat the user was looking at when they pressed New.
 *
 * Upstream carries model, permission mode and interaction mode forward from the
 * viewed thread. That carry has to lose to this setting, because it wins in
 * every realistic case: you are nearly always sitting in some chat when you
 * start another, so a carried "default" was overriding the preference on every
 * single new chat. The `resolveInitialInteractionMode` fallback further down
 * the chain only ran when there was nothing at all to carry, which made the
 * setting look like it did nothing.
 *
 * Carrying is still right when the setting is off: it is how a run of chats in
 * plan mode stays in plan mode without touching the toggle each time.
 *
 * An explicit per-chat choice is unaffected. The composer records the mode
 * toggle against the draft itself, and that reading outranks the seed this
 * produces, so reopening a draft you deliberately flipped to Build leaves it in
 * Build.
 */
export function resolveNewThreadInteractionMode(
  carriedInteractionMode: ProviderInteractionMode | null | undefined,
): ProviderInteractionMode | null {
  if (readStartInPlanMode()) return "plan";
  return carriedInteractionMode ?? null;
}
