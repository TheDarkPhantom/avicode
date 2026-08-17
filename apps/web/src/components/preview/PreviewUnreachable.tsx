import { useState } from "react";

import { Button } from "~/components/ui/button";

import { describePreviewError } from "./errorCodeMessages";

interface Props {
  url: string;
  /** Chromium net error code (negative, e.g. -105) or an HTTP status (>= 400). */
  code: number;
  /** Stringified Chromium error, e.g. "ERR_NAME_NOT_RESOLVED", or HTTP status text. */
  description: string;
  onReload: () => void;
  /**
   * Avi Code addition: desktop-only. Clears the isolated preview partition's
   * cookies then reloads. Surfaced only for cookie/header HTTP errors (notably
   * 431 Request Header Fields Too Large), where oversized login cookies in the
   * preview's separate cookie jar overflow the dev server's header limit.
   */
  onClearCookies?: (() => void) | undefined;
}

// Avi Code addition: Chromium net errors are negative; a real HTTP response
// carries a positive status. Header/cookie-bloat statuses are where clearing the
// preview partition's cookies is the actual fix.
const COOKIE_BLOAT_STATUSES: ReadonlySet<number> = new Set([400, 431, 494]);

/** Theme-aware tailwind port of Chromium's "This site can't be reached" page. */
export function PreviewUnreachable({ url, code, description, onReload, onClearCookies }: Props) {
  const [showDetails, setShowDetails] = useState(false);
  const host = safeHost(url) ?? url;
  const isHttpError = code >= 400;
  const cookieBloat = isHttpError && COOKIE_BLOAT_STATUSES.has(code);
  const friendly = isHttpError
    ? httpStatusMessage(code, description)
    : describePreviewError(description);
  const errorLabel = isHttpError
    ? `HTTP ${code}${description.length > 0 ? ` ${description}` : ""}`
    : description.length > 0
      ? description
      : `ERR_${Math.abs(code) || "FAILED"}`;
  const showClearCookies = cookieBloat && onClearCookies !== undefined;

  return (
    <div className="relative flex h-full min-h-0 w-full overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col px-8 py-12 sm:py-16">
        <ErrorIcon className="mb-6 size-12 text-muted-foreground/70" />
        <h1 className="mb-3 text-2xl font-semibold leading-tight text-foreground">
          {isHttpError ? "This site returned an error" : "This site can’t be reached"}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{host}</span>: {friendly}.
        </p>

        {showDetails ? (
          <div className="mt-6 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <p className="mb-2 font-medium text-foreground">Try:</p>
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              {cookieBloat ? (
                <>
                  <li>
                    Clearing this preview&rsquo;s cookies (large logins overflow header limits)
                  </li>
                  <li>Signing in again after clearing</li>
                  <li>Raising the dev server header limit if cookies are legitimately large</li>
                </>
              ) : isHttpError ? (
                <>
                  <li>Checking the dev server logs for this status</li>
                  <li>Confirming you are signed in to the app</li>
                  <li>Reloading once the route is fixed</li>
                </>
              ) : (
                <>
                  <li>Checking your connection</li>
                  <li>Confirming the dev server is running</li>
                  <li>Checking the proxy and the firewall</li>
                </>
              )}
            </ul>
          </div>
        ) : null}

        <div className="mt-8 text-xs uppercase tracking-wide text-muted-foreground/70">
          {errorLabel}
        </div>

        <div className="mt-auto flex items-center gap-2 pt-8">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowDetails((value) => !value)}
          >
            {showDetails ? "Hide details" : "Details"}
          </Button>
          <div className="flex-1" />
          {showClearCookies ? (
            <Button type="button" variant="outline" size="sm" onClick={onClearCookies}>
              Clear cookies and reload
            </Button>
          ) : null}
          <Button type="button" size="sm" onClick={onReload}>
            Reload
          </Button>
        </div>
      </div>
    </div>
  );
}

// Avi Code addition: turn a raw HTTP status into a readable sentence, favouring
// the server's status text when present.
function httpStatusMessage(code: number, description: string): string {
  if (code === 431) return "the request headers were too large (likely oversized cookies)";
  if (description.length > 0) return `the server responded with ${code} ${description}`;
  return `the server responded with HTTP ${code}`;
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className={className}
    >
      <path d="M16 12 L48 12 L48 52 L16 52 Z" />
      <path d="M22 22 L42 22 M22 30 L36 30 M22 38 L40 38" strokeLinecap="round" />
      <path d="M52 8 L12 56" strokeLinecap="round" />
    </svg>
  );
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}
