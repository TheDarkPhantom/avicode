/**
 * Avi Code addition: paints find matches without touching the DOM tree.
 *
 * Uses the CSS Custom Highlight API rather than wrapping matches in `<mark>`.
 * Wrapping is not an option here: fenced code blocks are injected as raw HTML
 * through `dangerouslySetInnerHTML`, so React cannot reach inside them, and
 * inserting elements would change measured row heights and fight the
 * virtualizer's sizing. Highlights are decoration only, so neither happens.
 *
 * Degrades to no highlight where the API is missing; find still scrolls and
 * counts, which is the part that cannot be done any other way.
 */

const ALL_HIGHLIGHT_NAME = "thread-find-match";
const ACTIVE_HIGHLIGHT_NAME = "thread-find-active";

interface HighlightRegistry {
  set: (name: string, highlight: unknown) => void;
  delete: (name: string) => void;
}

interface HighlightConstructor {
  new (...ranges: Range[]): unknown;
}

function highlightApi(): {
  registry: HighlightRegistry;
  Highlight: HighlightConstructor;
} | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const Highlight = (globalThis as { Highlight?: HighlightConstructor }).Highlight;
  if (!css?.highlights || typeof Highlight !== "function") return null;
  return { registry: css.highlights, Highlight };
}

export function clearFindHighlights(): void {
  const api = highlightApi();
  if (!api) return;
  api.registry.delete(ALL_HIGHLIGHT_NAME);
  api.registry.delete(ACTIVE_HIGHLIGHT_NAME);
}

/** Text nodes under `root`, skipping ones with no visible content. */
function collectTextNodes(root: Element): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    if (node.nodeValue && node.nodeValue.length > 0) nodes.push(node as Text);
    node = walker.nextNode();
  }
  return nodes;
}

/**
 * Highlight every occurrence of `query` inside `root`, marking the one at
 * `activeOccurrence` distinctly. Returns how many occurrences were found, which
 * is the count for that row only.
 */
export function paintFindHighlights(
  root: Element | null,
  query: string,
  activeOccurrence: number,
): number {
  const api = highlightApi();
  if (!api) return 0;
  api.registry.delete(ALL_HIGHLIGHT_NAME);
  api.registry.delete(ACTIVE_HIGHLIGHT_NAME);

  const needle = query.trim().toLowerCase();
  if (!root || needle.length === 0) return 0;

  const ranges: Range[] = [];
  for (const textNode of collectTextNodes(root)) {
    const haystack = (textNode.nodeValue ?? "").toLowerCase();
    let offset = haystack.indexOf(needle);
    while (offset !== -1) {
      const range = document.createRange();
      range.setStart(textNode, offset);
      range.setEnd(textNode, offset + needle.length);
      ranges.push(range);
      offset = haystack.indexOf(needle, offset + needle.length);
    }
  }
  if (ranges.length === 0) return 0;

  const active = ranges[Math.max(0, Math.min(ranges.length - 1, activeOccurrence))];
  const rest = ranges.filter((range) => range !== active);
  if (rest.length > 0) {
    api.registry.set(ALL_HIGHLIGHT_NAME, new api.Highlight(...rest));
  }
  if (active) {
    api.registry.set(ACTIVE_HIGHLIGHT_NAME, new api.Highlight(active));
  }
  return ranges.length;
}
