import { isPublicFaviconHost } from "./faviconHost";

/**
 * Favicon helpers for the preview tab strip and chat links.
 *
 * Uses Google's s2 favicon endpoint (same approach as ami's tab strip).
 * Callers should always render a `<Globe />` fallback when this returns null
 * or the returned URL fails to load via an `onError` handler.
 */
const FAVICON_PROVIDER = "https://www.google.com/s2/favicons";

/**
 * A public favicon URL that discloses only a public hostname, never the port,
 * path, or a private or internal-looking host (Avi Code addition, ported from
 * upstream #16950).
 */
export function faviconUrlForOrigin(rawUrl: string | null | undefined, size = 32): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!url.hostname) return null;
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!isPublicFaviconHost(url.hostname)) return null;
    return `${FAVICON_PROVIDER}?domain=${encodeURIComponent(url.hostname)}&sz=${size}`;
  } catch {
    return null;
  }
}
