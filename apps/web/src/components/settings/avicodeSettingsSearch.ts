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
  {
    id: "avicode-notification-sound-input",
    title: msg("Sound when an agent needs you"),
    to: "/settings/avicode",
    searchTerms: [msg("notification sound alert chime input approval waiting")],
  },
  {
    id: "avicode-notification-sound-completion",
    title: msg("Sound when an agent finishes"),
    to: "/settings/avicode",
    searchTerms: [msg("notification sound alert chime done finished completion")],
  },
  {
    id: "avicode-sidebar-folders",
    title: msg("Sidebar folders"),
    to: "/settings/avicode",
    searchTerms: [msg("folders group projects sidebar hide show restore reorder")],
  },
  {
    id: "avicode-sidebar-folder-attention",
    title: msg("Keep chats that need you visible under collapsed folders"),
    to: "/settings/avicode",
    searchTerms: [msg("collapsed folder attention approval input failed plan ready sidebar")],
  },
] as const satisfies ReadonlyArray<SettingsSearchItem>;
