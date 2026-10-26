/**
 * Inline markdown link destinations, `[label](href "title")`, found with a
 * linear scan. A regex with the same grammar backtracks over every suffix of
 * an unclosed label or destination, so a long streaming reply full of `[` or
 * `[](a` took quadratic time on every render.
 *
 * Grammar (unchanged from the regex it replaces): a label with no `]` inside,
 * `(`, a destination with no whitespace or `)`, an optional whitespace-led
 * quoted title, then `)`.
 */

/** Reuses delimiter searches when successive candidates fall in the same run. */
function markdownRunEndFinder(markdown: string, delimiter: RegExp) {
  let runStart = -1;
  let runEnd = -1;
  return (start: number) => {
    if (start >= runStart && start <= runEnd) return runEnd;
    delimiter.lastIndex = start;
    runStart = start;
    runEnd = delimiter.exec(markdown)?.index ?? markdown.length;
    return runEnd;
  };
}

function markdownLinkDestinationScanner(markdown: string) {
  const bareEnd = markdownRunEndFinder(markdown, /[\s)]/g);
  const whitespaceEnd = markdownRunEndFinder(markdown, /\S/g);
  const titleEnd = markdownRunEndFinder(markdown, /["']/g);
  return (start: number) => {
    if (markdown[start] !== "(") return null;
    const hrefStart = start + 1;
    const hrefEnd = bareEnd(hrefStart);
    if (hrefEnd === hrefStart || hrefEnd === markdown.length) return null;
    if (markdown[hrefEnd] === ")") return { hrefStart, hrefEnd, end: hrefEnd + 1 };
    // hrefEnd sits on whitespace: only a quoted title may follow.
    const quoteStart = whitespaceEnd(hrefEnd);
    if (markdown[quoteStart] !== '"' && markdown[quoteStart] !== "'") return null;
    const quoteEnd = titleEnd(quoteStart + 1);
    if (quoteEnd === markdown.length || markdown[quoteEnd + 1] !== ")") return null;
    return { hrefStart, hrefEnd, end: quoteEnd + 2 };
  };
}

export function extractMarkdownLinkHrefs(markdown: string): string[] {
  const hrefs: string[] = [];
  const scanDestination = markdownLinkDestinationScanner(markdown);
  let cursor = 0;
  while (cursor < markdown.length) {
    const labelStart = markdown.indexOf("[", cursor);
    if (labelStart === -1) break;
    const labelEnd = markdown.indexOf("]", labelStart + 1);
    if (labelEnd === -1) break;

    // Nested opening brackets share this closing bracket. On failure, skip the
    // whole label instead of rescanning its suffix from each opening bracket.
    cursor = labelEnd + 1;
    const destination = scanDestination(cursor);
    if (!destination) continue;
    cursor = destination.end;
    const href = markdown.slice(destination.hrefStart, destination.hrefEnd).trim();
    if (href) hrefs.push(href);
  }
  return hrefs;
}
