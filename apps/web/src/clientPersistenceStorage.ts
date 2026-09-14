import { ClientSettingsSchema, type ClientSettings } from "@t3tools/contracts";
import { decodeClientSettingsResilient } from "@t3tools/shared/resilientClientSettings";

import { setLocalStorageItem } from "./hooks/useLocalStorage";

export const CLIENT_SETTINGS_STORAGE_KEY = "t3code:client-settings:v1";

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

// Avi Code addition: read the raw blob and decode field-by-field so one invalid
// saved value defaults just that field instead of discarding every setting.
export function readBrowserClientSettings(): ClientSettings | null {
  if (!hasWindow()) {
    return null;
  }

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(CLIENT_SETTINGS_STORAGE_KEY);
  } catch (error) {
    console.error("Could not read persisted client settings.", error);
    return null;
  }
  if (raw === null) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error("Could not parse persisted client settings.", error);
    return null;
  }

  return decodeClientSettingsResilient(parsed);
}

export function writeBrowserClientSettings(settings: ClientSettings): void {
  if (!hasWindow()) {
    return;
  }

  setLocalStorageItem(CLIENT_SETTINGS_STORAGE_KEY, settings, ClientSettingsSchema);
}
