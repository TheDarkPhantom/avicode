/**
 * Avi Code addition (upstream #16284): plain-text line for the agent's latest
 * thought, shown on the chat's live working row and on running sidebar rows.
 * A bold-only opening line (the Codex summary heading) wins; otherwise this is
 * the first sentence of the reasoning text. Upstream keeps this in
 * client-runtime's work-log presentation module, which the fork does not have.
 */
export function liveThoughtLine(markdown: string): string {
  const heading = /^\s*\*\*([^*\r\n]+)\*\*[ \t]*\r?(?:\n|$)/.exec(markdown)?.[1];
  const text = (heading ?? markdown)
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[ \t]*(?:#{1,6}|[-*+]|\d+\.)[ \t]+/gm, "")
    .replace(/`+|\*\*|~~/g, "")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?![\w*])/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
  if (heading !== undefined) return text;
  // Cut after the first . ? or ! (plus a closing quote or paren) that a space follows.
  const end = /[.?!]["'”’)]?(?=\s)/.exec(text);
  return end ? text.slice(0, end.index + end[0].length) : text;
}

/** Longest live thought line the server sends for a sidebar row. */
export const SIDEBAR_LIVE_THOUGHT_MAX_LENGTH = 140;

/**
 * `liveThoughtLine` capped for the sidebar's thought stream, so one long
 * unpunctuated thought never puts a paragraph on the wire.
 */
export function sidebarLiveThoughtLine(markdown: string): string {
  const line = liveThoughtLine(markdown);
  return line.length <= SIDEBAR_LIVE_THOUGHT_MAX_LENGTH
    ? line
    : `${line.slice(0, SIDEBAR_LIVE_THOUGHT_MAX_LENGTH - 1).trimEnd()}…`;
}
