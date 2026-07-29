import { AVICODE_IDENTITY } from "@t3tools/shared/avicodeIdentity";

export const WINDOW_TITLE_PRIVACY_KEY = "avicode:window-title-privacy";
export const WINDOW_TITLE_PRIVACY_EVENT = "avicode:window-title-privacy-changed";

export function isWindowTitlePrivacyEnabled(): boolean {
  return (
    typeof localStorage !== "undefined" && localStorage.getItem(WINDOW_TITLE_PRIVACY_KEY) === "1"
  );
}

export function setWindowTitlePrivacyEnabled(enabled: boolean): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(WINDOW_TITLE_PRIVACY_KEY, enabled ? "1" : "0");
  } catch {
    // Blocked or full storage throws synchronously out of the click handler
    // that calls this. Losing the preference beats tearing down the React tree,
    // so apply the change for this session and move on.
  }
  window.dispatchEvent(new CustomEvent(WINDOW_TITLE_PRIVACY_EVENT));
}

export function formatThreadWindowTitle(input: {
  readonly repository: string | null;
  readonly threadTitle: string | null;
  readonly private: boolean;
}): string {
  if (input.private) return AVICODE_IDENTITY.productName;
  return [input.repository, input.threadTitle, AVICODE_IDENTITY.productName]
    .filter((value): value is string => Boolean(value?.trim()))
    .join(" — ");
}
