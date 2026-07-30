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
