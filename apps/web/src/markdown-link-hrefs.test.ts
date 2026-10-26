import { describe, expect, it } from "vite-plus/test";

import { extractMarkdownLinkHrefs } from "./markdown-link-hrefs";

// The regex the scanner replaced. Kept here as the reference grammar.
const REFERENCE_PATTERN = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g;

function referenceHrefs(markdown: string): string[] {
  return [...markdown.matchAll(REFERENCE_PATTERN)]
    .map((match) => match[1]?.trim() ?? "")
    .filter((href) => href.length > 0);
}

describe("extractMarkdownLinkHrefs", () => {
  it.each([
    "[a](src/main.ts)",
    "[a](src/main.ts 'title') and [b](other.ts \"t\")",
    "[[[nested](src/main.ts) [unfinished",
    "[outer [inner] invalid [valid](src/main.ts)",
    "[bad](missing title [valid](src/main.ts)",
    "```text\n[link](src/main.ts)\n```",
    "[empty]() [valid](src/main.ts 'title')",
    "[a](foo \"mixed title') [b](< >)",
    "[a](foo ) [b](bar)",
    "[a](foo 'x' ) [b](bar)",
    "[a](foo\n'x') [b](C:\\Users\\me\\a.ts:12)",
    "[a](foo 'unterminated [b](bar)",
    "[a] (gap) [b](https://example.com/x?y=1)",
    "no links here",
    "[a](x)[b](y)[c](z)",
  ])("matches the reference grammar for %j", (markdown) => {
    expect(extractMarkdownLinkHrefs(markdown)).toEqual(referenceHrefs(markdown));
  });

  it.each([
    ["[".repeat(32_000), []],
    ["[](a".repeat(16_000), []],
    ["[x](https://e.com/".repeat(8_000), []],
    ["```text\n" + "[unfinished item\n".repeat(8_000) + "```", []],
  ])("scans adversarial text without backtracking", (markdown, hrefs) => {
    const startedAt = performance.now();
    expect(extractMarkdownLinkHrefs(markdown)).toEqual(hrefs);
    expect(performance.now() - startedAt).toBeLessThan(100);
  });
});
