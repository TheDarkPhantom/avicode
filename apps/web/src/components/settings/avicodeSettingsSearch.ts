import { msg } from "gt-react";

import type { SettingsSearchItem } from "./settingsSearch";

/** Avi Code settings rows, spread into upstream's search index. */
export const AVICODE_SETTINGS_SEARCH_ITEMS = [
  {
    id: "avicode-window-title-names",
    title: msg("Show repository and thread in the window title"),
    to: "/settings/avicode",
    searchTerms: [msg("window title privacy time tracker ALFRED ActivityWatch project name")],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;
