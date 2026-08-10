import { describe, expect, it } from "vite-plus/test";

import { CHANGELOG_RELEASES } from "./changelogSource";
import { parseChangelog, parseInlineSegments } from "./parseChangelog";

const SAMPLE = `# Changelog

Preamble prose that must never show up as a release.

<!--
Format notes live in a comment and are skipped.
## Not a release
-->

## Unreleased

Upstream: t3code 0.0.31

### Avi Code

- See what changed in each version without leaving the app (#53)

## 0.0.31-avicode.1 (2026-07-30)

Upstream: t3code 0.0.31

### Avi Code

- Claude stops editing files while it is planning (#43)
- Pick a colour theme: Oxblood, Midnight, or Forest, each with a light and a
  dark variant (#30)
- Coding agents get clearer guidance about \`CLAUDE.md\` (#36)

### Upstream t3code

Merged in [#49](https://github.com/TheDarkPhantom/avicode/pull/49), covering t3code 0.0.29
through 0.0.31.

- Large threads load faster (#4788 by Theo Browne)
- The desktop app installs about 300MB smaller (#4824 by wukko)
`;

describe("parseChangelog", () => {
  const releases = parseChangelog(SAMPLE);

  it("ignores the preamble and HTML comments", () => {
    expect(releases.map((release) => release.version)).toEqual(["Unreleased", "0.0.31-avicode.1"]);
  });

  it("reads the date and the upstream baseline of each release", () => {
    expect(releases[0]).toMatchObject({
      isUnreleased: true,
      date: null,
      upstreamVersion: "0.0.31",
    });
    expect(releases[1]).toMatchObject({
      isUnreleased: false,
      date: "2026-07-30",
      upstreamVersion: "0.0.31",
    });
  });

  it("separates fork sections from upstream sections", () => {
    expect(releases[1]?.sections.map((section) => [section.title, section.origin])).toEqual([
      ["Avi Code", "avicode"],
      ["Upstream t3code", "upstream"],
    ]);
  });

  it("pulls the pull request number off a fork entry", () => {
    expect(releases[1]?.sections[0]?.entries[0]).toEqual({
      summary: [{ kind: "text", text: "Claude stops editing files while it is planning" }],
      pullRequest: 43,
      author: null,
    });
  });

  // Entries are sentences, so they wrap. A continuation line used to be read as section prose,
  // which stranded the trailing `(#30)` and cost the entry its link.
  it("rejoins a wrapped entry", () => {
    expect(releases[1]?.sections[0]?.entries[1]).toEqual({
      summary: [
        {
          kind: "text",
          text: "Pick a colour theme: Oxblood, Midnight, or Forest, each with a light and a dark variant",
        },
      ],
      pullRequest: 30,
      author: null,
    });
  });

  it("credits the author of an upstream entry", () => {
    expect(releases[1]?.sections[1]?.entries).toEqual([
      {
        summary: [{ kind: "text", text: "Large threads load faster" }],
        pullRequest: 4788,
        author: "Theo Browne",
      },
      {
        summary: [{ kind: "text", text: "The desktop app installs about 300MB smaller" }],
        pullRequest: 4824,
        author: "wukko",
      },
    ]);
  });

  it("reflows a wrapped section note and keeps its links", () => {
    expect(releases[1]?.sections[1]?.note).toEqual([
      { kind: "text", text: "Merged in " },
      { kind: "link", text: "#49", url: "https://github.com/TheDarkPhantom/avicode/pull/49" },
      { kind: "text", text: ", covering t3code 0.0.29 through 0.0.31." },
    ]);
  });

  it("returns nothing for markdown without releases", () => {
    expect(parseChangelog("# Changelog\n\nNothing here yet.\n")).toEqual([]);
  });
});

describe("parseInlineSegments", () => {
  it("splits inline code and links out of prose", () => {
    expect(parseInlineSegments("see `vp check` and [docs](https://example.com) now")).toEqual([
      { kind: "text", text: "see " },
      { kind: "code", text: "vp check" },
      { kind: "text", text: " and " },
      { kind: "link", text: "docs", url: "https://example.com" },
      { kind: "text", text: " now" },
    ]);
  });

  it("leaves plain prose untouched", () => {
    expect(parseInlineSegments("plain prose")).toEqual([{ kind: "text", text: "plain prose" }]);
  });
});

// The rendered page is only as good as the file it reads, so hold the real CHANGELOG.md to the
// format the parser expects. A malformed heading would otherwise silently drop a whole release.
describe("CHANGELOG.md", () => {
  it("parses into releases", () => {
    expect(CHANGELOG_RELEASES.length).toBeGreaterThan(0);
  });

  // Unreleased sits at the top while work is waiting to ship, but a release bump renames it and
  // leaves nothing behind. Requiring it unconditionally made cutting a version impossible without
  // inventing a filler entry, since every section below must also be non-empty. What has to hold
  // is that it never appears anywhere but first.
  it("keeps Unreleased at the top when present, and never repeats a version", () => {
    const unreleasedIndex = CHANGELOG_RELEASES.findIndex((release) => release.isUnreleased);
    expect(unreleasedIndex, "Unreleased must come first when it exists").toBeLessThanOrEqual(0);
    const versions = CHANGELOG_RELEASES.map((release) => release.version);
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("dates every released version and names its upstream baseline", () => {
    for (const release of CHANGELOG_RELEASES) {
      expect(release.upstreamVersion, `${release.version} upstream baseline`).toBeTruthy();
      if (release.isUnreleased) continue;
      expect(release.date, `${release.version} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(release.version, `${release.version} suffix`).toMatch(/-avicode\.\d+(?:\.\d+)?$/u);
    }
  });

  it("gives every entry a pull request, and every upstream entry an author", () => {
    for (const release of CHANGELOG_RELEASES) {
      expect(release.sections.length, `${release.version} sections`).toBeGreaterThan(0);
      for (const section of release.sections) {
        expect(section.entries.length, `${release.version} / ${section.title}`).toBeGreaterThan(0);
        for (const entry of section.entries) {
          const label = `${release.version} / ${section.title}: ${JSON.stringify(entry.summary)}`;
          expect(entry.pullRequest, label).toBeTypeOf("number");
          if (section.origin === "upstream") {
            expect(entry.author, label).toBeTruthy();
          } else {
            expect(entry.author, label).toBeNull();
          }
        }
      }
    }
  });

  // House style, enforced so it cannot drift back one careless entry at a time: entries read as
  // outcomes rather than commit subjects, stay to one short sentence, and use no em dashes.
  it("keeps entries short, em-dash free, and out of commit-subject voice", () => {
    for (const release of CHANGELOG_RELEASES) {
      for (const section of release.sections) {
        for (const entry of section.entries) {
          const text = entry.summary.map((segment) => segment.text).join("");
          const label = `${release.version} / ${section.title}: ${text}`;
          expect(text, label).not.toMatch(
            /^(?:feat|fix|chore|docs|refactor|perf|test|build|ci|style)(?:\([^)]*\))?!?:/u,
          );
          expect(text, label).not.toMatch(/[—–]/u);
          expect(text.length, label).toBeLessThanOrEqual(100);
        }
      }
    }
  });
});
