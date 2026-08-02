/**
 * Avi Code addition: scanner for `claude auth login --claudeai` output.
 *
 * The CLI is not scriptable — there is no `--json` mode and no exit code that
 * distinguishes "wrong code" from "cancelled". Its observable protocol over
 * plain pipes is:
 *
 *   stdout  Opening browser to sign in…
 *   stdout  If the browser didn't open, visit: https://claude.com/…/oauth/authorize?…
 *   stdout  Paste code here if prompted >            <- no trailing newline
 *   stderr  Invalid code. Please make sure the full code was copied.
 *
 * so the login flow is driven by scraping it. Two properties make a naive
 * line-splitter wrong, and both are why this module exists:
 *
 *   1. The "paste code" prompt never terminates with a newline, so it only
 *      ever appears in the unterminated tail.
 *   2. A rejected code is *not* terminal — the CLI re-prompts on the same
 *      process — so rejection has to be reported without ending the session,
 *      and the *same* rejection text repeats if the user pastes badly twice.
 *
 * Complete lines are therefore scanned exactly once each, and the tail is
 * re-scanned every chunk behind emit-once flags.
 *
 * Scanning is deliberately tolerant: an unrecognized line is ignored rather
 * than treated as a failure, so a wording change upstream degrades the flow to
 * "URL shown, code accepted, success decided by `claude auth status`" instead
 * of breaking it.
 *
 * @module provider/ClaudeLogin/claudeLoginOutput
 */

/** Events the scanner can derive from CLI output. Terminal state is decided by the process exit, not here. */
export type ClaudeLoginOutputEvent =
  | { readonly type: "authorizationUrl"; readonly url: string }
  | { readonly type: "awaitingCode" }
  | { readonly type: "codeRejected"; readonly message: string };

/**
 * Cap on the retained unterminated tail. The prompt never gets a newline, so
 * without a bound the tail would grow for the life of the session. Generous
 * enough to hold the authorization URL line whole.
 */
const MAX_PENDING_LENGTH = 8_192;

const AUTHORIZATION_URL_PATTERN = /https?:\/\/\S*\/oauth\/authorize\S*/;
/** Fallback for a reworded URL line: any URL on a line that offers one to visit. */
const VISIT_URL_PATTERN = /(?:visit|open|go to)\b[^\n]*?(https?:\/\/\S+)/i;
const CODE_PROMPT_PATTERN = /paste\s+code\s+here/i;
/**
 * Deliberately unanchored. The prompt is never newline-terminated, so the
 * rejection that follows it lands on the *same* logical line as
 * `Paste code here if prompted > ` — anchoring at line start never matches in
 * practice.
 */
const INVALID_CODE_PATTERN = /(invalid code\b[^\n]*)/i;

/**
 * ANSI CSI sequences (colour, cursor moves) so patterns match styled output.
 * The `\u001b` prefix is load-bearing: without it the class ranges also match
 * ordinary bracketed text such as `[abc]`.
 */
const ANSI_PATTERN = /\u001b\[[0-9;?]*[\x20-\x2F]*[\x40-\x7E]/g;

const stripAnsi = (value: string): string => value.replace(ANSI_PATTERN, "");

/** Trailing punctuation and quotes cling to a scraped URL; none are part of it. */
const trimUrl = (value: string): string => value.replace(/["'>,.)\]]+$/, "");

/**
 * Extract the authorization URL.
 *
 * `requireTerminator` guards the unterminated tail: a URL that runs to the end
 * of the buffer may simply be half-delivered, and emitting it would hand the
 * user a truncated link that fails at the authorization server. A following
 * character proves the URL ended where the match did.
 */
const scanForUrl = (text: string, requireTerminator: boolean): string | undefined => {
  const direct = AUTHORIZATION_URL_PATTERN.exec(text);
  if (direct) {
    if (requireTerminator && direct.index + direct[0].length >= text.length) return undefined;
    return trimUrl(direct[0]);
  }
  const viaVisit = VISIT_URL_PATTERN.exec(text);
  const matched = viaVisit?.[1];
  if (!matched) return undefined;
  if (requireTerminator && viaVisit.index + viaVisit[0].length >= text.length) return undefined;
  return trimUrl(matched);
};

export interface ClaudeLoginOutputScanner {
  /**
   * Feed a chunk of stdout or stderr. Both streams share one scanner: the CLI
   * splits a single conversation across them (prompt on stdout, rejection on
   * stderr) and the client only needs the merged sequence.
   */
  readonly push: (chunk: string) => ReadonlyArray<ClaudeLoginOutputEvent>;
}

export const makeClaudeLoginOutputScanner = (): ClaudeLoginOutputScanner => {
  let pending = "";
  let urlEmitted = false;
  let awaitingEmitted = false;

  return {
    push: (chunk) => {
      const parts = (pending + stripAnsi(chunk)).split(/\r?\n/);
      // The final part is whatever has not been newline-terminated yet.
      pending = parts.pop() ?? "";
      const events: ClaudeLoginOutputEvent[] = [];

      const takeUrl = (text: string, requireTerminator: boolean) => {
        if (urlEmitted) return;
        const url = scanForUrl(text, requireTerminator);
        if (!url) return;
        urlEmitted = true;
        events.push({ type: "authorizationUrl", url });
      };

      const takePrompt = (text: string) => {
        if (awaitingEmitted || !CODE_PROMPT_PATTERN.test(text)) return;
        awaitingEmitted = true;
        events.push({ type: "awaitingCode" });
      };

      for (const line of parts) {
        takeUrl(line, false);
        // Every complete line is scanned once, so a repeated rejection with
        // identical wording still reports twice.
        const rejection = INVALID_CODE_PATTERN.exec(line);
        const message = rejection?.[1]?.trim();
        if (message) events.push({ type: "codeRejected", message });
        takePrompt(line);
      }

      // The tail carries the prompt (and the URL, if its line is still
      // arriving). Both are guarded by emit-once flags, so re-scanning the
      // same tail on the next chunk cannot double-report.
      takeUrl(pending, true);
      takePrompt(pending);

      if (pending.length > MAX_PENDING_LENGTH) pending = pending.slice(-MAX_PENDING_LENGTH);
      return events;
    },
  };
};
