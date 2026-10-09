/**
 * Avi Code addition (ported from upstream #16950): heading anchors for rendered
 * markdown, so a table-of-contents link such as `[Setup](#setup)` finds its
 * heading. Runs as a rehype plugin after sanitizing, so the ids it assigns are
 * not prefixed a second time.
 */

/** The prefix rehype-sanitize puts on authored ids so they cannot clobber app element ids. */
export const SANITIZED_FRAGMENT_PREFIX = "user-content-";

type HeadingHastNode = {
  type?: string;
  tagName?: string;
  value?: unknown;
  properties?: Record<string, unknown>;
  children?: HeadingHastNode[];
};

function hastText(node: HeadingHastNode): string {
  if (node.type === "text" && typeof node.value === "string") return node.value;
  return node.children?.map(hastText).join("") ?? "";
}

/** GitHub's heading anchor slug, so `[Setup](#setup)` table-of-contents links find their heading. */
export function githubHeadingSlug(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

/**
 * Gives headings without an authored id GitHub's slug id, deduplicated per document. Like the
 * sanitizer's ids, they carry the `user-content-` prefix; fragment lookup strips it.
 */
export function rehypeHeadingIds() {
  return (tree: HeadingHastNode) => {
    // Every id already in the document, authored or assigned, so a suffix never
    // lands on one that exists: `Setup`, `Setup`, `Setup-1` get three distinct ids.
    const taken = new Set<string>();
    const collect = (node: HeadingHastNode) => {
      const id = node.properties?.id;
      if (typeof id === "string") taken.add(id);
      node.children?.forEach(collect);
    };
    collect(tree);
    const nextSuffix = new Map<string, number>();
    const visit = (node: HeadingHastNode) => {
      if (node.type === "element" && node.tagName && /^h[1-6]$/.test(node.tagName)) {
        const slug = githubHeadingSlug(hastText(node));
        if (node.properties?.id === undefined && slug) {
          let count = nextSuffix.get(slug) ?? 0;
          let id = `${SANITIZED_FRAGMENT_PREFIX}${slug}`;
          while (taken.has(id)) {
            count += 1;
            id = `${SANITIZED_FRAGMENT_PREFIX}${slug}-${count}`;
          }
          nextSuffix.set(slug, count);
          taken.add(id);
          node.properties = { ...node.properties, id };
        }
        return;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
