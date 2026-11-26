import type { ProviderInteractionMode } from "@t3tools/contracts";

import { DEFAULT_INTERACTION_MODE } from "../types";

// composerDraftStore loads at startup through connection/platform, and importing hooks/useSettings
// from that graph forms a module cycle through state/server. useSettings registers the reader
// instead; until it does, upstream's default applies.
let readStartInPlanMode: () => boolean = () => false;

export function registerStartInPlanModeReader(reader: () => boolean): void {
  readStartInPlanMode = reader;
}

/** The mode a brand-new draft is seeded with when nothing was carried or requested. */
export function resolveInitialInteractionMode(): ProviderInteractionMode {
  return readStartInPlanMode() ? "plan" : DEFAULT_INTERACTION_MODE;
}

/**
 * The mode a new chat opens in, given the mode carried from the chat the user was viewing. The
 * setting beats the carry: you are nearly always in some chat when you press New, so a carried
 * "default" would otherwise override the preference every time.
 */
export function resolveNewThreadInteractionMode(
  carriedInteractionMode: ProviderInteractionMode | null | undefined,
): ProviderInteractionMode | null {
  if (readStartInPlanMode()) return "plan";
  return carriedInteractionMode ?? null;
}
