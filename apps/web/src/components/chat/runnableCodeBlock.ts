// Ported from upstream #13060: a shell code block in an assistant message can
// be run in the thread's terminal. Only a finished, single-line command
// qualifies, so what the button sends is exactly what the block shows.

const SHELL_FENCE_LANGUAGE_REGEX = /^(?:sh|bash|zsh|fish|shell|powershell|pwsh)$/;

// Control and invisible format characters (bidi overrides, zero-width) can make
// the rendered command differ from what the terminal would receive. A newline
// is a control character too, which is what limits this to one line.
const CONTROL_OR_FORMAT_CHARACTER_REGEX = /[\p{Cc}\p{Cf}]/u;

export function isShellFenceLanguage(language: string): boolean {
  return SHELL_FENCE_LANGUAGE_REGEX.test(language);
}

/**
 * The command a shell block's Run button sends, or null when the block should
 * not offer one. `code` is the fenced block's text, which ends in a newline.
 */
export function resolveRunnableShellCommand(code: string, language: string): string | null {
  if (!isShellFenceLanguage(language) || !code.endsWith("\n")) return null;
  const command = code.trim();
  if (command.length === 0 || command.endsWith("\\")) return null;
  if (CONTROL_OR_FORMAT_CHARACTER_REGEX.test(code.slice(0, -1))) return null;
  return command;
}

/**
 * True when the markdown source between `start` and `end` is a fenced block
 * with a matching closing fence, so a block still being typed out (or raw HTML
 * `<pre>`) never offers Run.
 */
export function isClosedCodeFence(
  source: string,
  start: number | undefined,
  end: number | undefined,
): boolean {
  if (start === undefined || end === undefined) return false;
  const block = source.slice(start, end);
  const opening = /^(?:`{3,}|~{3,})/.exec(block)?.[0];
  // One class for the blockquote prefix: nested quantifiers here backtrack
  // exponentially on code lines that start with many `> ` markers.
  const closing = /(?:^|\n)[ \t>]*(`{3,}|~{3,})[ \t\r]*$/.exec(block)?.[1];
  return (
    opening !== undefined &&
    closing !== undefined &&
    opening[0] === closing[0] &&
    closing.length >= opening.length
  );
}
