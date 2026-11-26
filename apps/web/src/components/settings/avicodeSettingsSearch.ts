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
  {
    id: "avicode-start-in-plan-mode",
    title: msg("Start new chats in plan mode"),
    to: "/settings/avicode",
    searchTerms: [msg("plan mode new chat thread default interaction mode build")],
  },
  {
    id: "avicode-quick-send-chips",
    title: msg("Quick-send chips"),
    to: "/settings/avicode",
    searchTerms: [msg("chips shortcut quick send message prompt composer button")],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;
