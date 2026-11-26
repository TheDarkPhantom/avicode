import type { ClientSettings } from "@t3tools/contracts/settings";

interface WindowTitleNames {
  readonly projectTitle: string | null;
  readonly threadTitle: string | null;
}

const HIDDEN_NAMES: WindowTitleNames = { projectTitle: null, threadTitle: null };

/** The project and thread names the window title may show, or none when the user hides them. */
export function avicodeWindowTitleNames(
  names: WindowTitleNames,
  settings: Pick<ClientSettings, "aviCodeWindowTitleShowNames">,
): WindowTitleNames {
  return settings.aviCodeWindowTitleShowNames ? names : HIDDEN_NAMES;
}
