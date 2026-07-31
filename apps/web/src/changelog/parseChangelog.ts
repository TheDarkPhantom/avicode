/**
 * Avi Code addition: parses the repository's `CHANGELOG.md` into the structure the in-app
 * changelog renders. Upstream ships no changelog at all, so nothing here replaces upstream
 * behaviour — but the format it parses is fork-specific, because this fork has to keep its own
 * changes separate from the ones a `pingdotgg/t3code` sync merge drags in.
 *
 * The markdown stays the single source of truth; the format it must follow is documented in a
 * comment at the top of `CHANGELOG.md`.
 */

export type ChangelogOrigin = "avicode" | "upstream";

/** One `[text](url)`, `` `code` ``, or plain-text run inside a summary or note. */
export type ChangelogInlineSegment =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "code"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly url: string };

export interface ChangelogEntry {
  readonly summary: readonly ChangelogInlineSegment[];
  /** Pull request number, resolved against the section's origin repository when linked. */
  readonly pullRequest: number | null;
  /** Only upstream entries carry an author; fork entries are all this repository's owner. */
  readonly author: string | null;
}

export interface ChangelogSection {
  readonly origin: ChangelogOrigin;
  readonly title: string;
  readonly note: readonly ChangelogInlineSegment[] | null;
  readonly entries: readonly ChangelogEntry[];
}

export interface ChangelogRelease {
  /** `Unreleased` or a fork version such as `0.0.31-avicode.1`. */
  readonly version: string;
  readonly isUnreleased: boolean;
  readonly date: string | null;
  /** The upstream t3code release this version sits on, from the `Upstream:` line. */
  readonly upstreamVersion: string | null;
  readonly note: readonly ChangelogInlineSegment[] | null;
  readonly sections: readonly ChangelogSection[];
}

const RELEASE_HEADING = /^##\s+(.+?)\s*$/u;
const SECTION_HEADING = /^###\s+(.+?)\s*$/u;
const LIST_ITEM = /^[-*]\s+(.+?)\s*$/u;
const RELEASE_DATE_SUFFIX = /^(.*?)\s*\((\d{4}-\d{2}-\d{2})\)$/u;
const UPSTREAM_LINE = /^Upstream:\s*(?:t3code\s*)?(.+?)\s*$/iu;
const ENTRY_SUFFIX = /^(.*?)\s*\(#(\d+)(?:\s+by\s+(.+?))?\)\s*$/u;
const INLINE_TOKEN = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/gu;

/** Splits prose into plain runs, inline code, and markdown links; other markdown is left as text. */
export function parseInlineSegments(value: string): readonly ChangelogInlineSegment[] {
  const segments: ChangelogInlineSegment[] = [];
  let cursor = 0;

  for (const match of value.matchAll(INLINE_TOKEN)) {
    const start = match.index;
    if (start > cursor) {
      segments.push({ kind: "text", text: value.slice(cursor, start) });
    }
    const [, code, linkText, linkUrl] = match;
    if (code !== undefined) {
      segments.push({ kind: "code", text: code });
    } else if (linkText !== undefined && linkUrl !== undefined) {
      segments.push({ kind: "link", text: linkText, url: linkUrl });
    }
    cursor = start + match[0].length;
  }

  if (cursor < value.length) {
    segments.push({ kind: "text", text: value.slice(cursor) });
  }
  return segments;
}

function resolveOrigin(title: string): ChangelogOrigin {
  return /^avi\s*code\b/iu.test(title) ? "avicode" : "upstream";
}

/**
 * Splits `<summary> (#123)` or `<summary> (#123 by Author)` apart. The credit sits inside the
 * pull request reference rather than after a dash, so nothing in the summary's own punctuation
 * can be mistaken for a byline.
 */
function parseEntry(raw: string): ChangelogEntry {
  const match = ENTRY_SUFFIX.exec(raw.trim());
  if (!match) {
    return { summary: parseInlineSegments(raw.trim()), pullRequest: null, author: null };
  }

  return {
    summary: parseInlineSegments((match[1] ?? "").trim()),
    pullRequest: Number.parseInt(match[2] ?? "", 10),
    author: match[3]?.trim() || null,
  };
}

/**
 * Reads the changelog markdown top-down. Anything above the first `##` is the file's preamble and
 * is ignored: the page states the fork's versioning rules itself rather than echoing them.
 */
export function parseChangelog(markdown: string): readonly ChangelogRelease[] {
  const releases: ChangelogRelease[] = [];
  let release: {
    version: string;
    date: string | null;
    upstreamVersion: string | null;
    noteLines: string[];
    sections: ChangelogSection[];
  } | null = null;
  let section: { origin: ChangelogOrigin; title: string; noteLines: string[] } | null = null;
  let entries: ChangelogEntry[] = [];
  // Entries are written as sentences, so they wrap. Their lines accumulate until a blank line or
  // the next heading ends the entry, then parse as one — otherwise a wrapped entry loses the
  // `(#123)` that landed on its continuation line.
  let entryLines: string[] | null = null;
  let insideHtmlComment = false;

  const closeEntry = () => {
    if (!entryLines) return;
    entries.push(parseEntry(entryLines.join(" ")));
    entryLines = null;
  };

  const closeSection = () => {
    closeEntry();
    if (!release || !section) return;
    release.sections.push({
      origin: section.origin,
      title: section.title,
      note: joinNote(section.noteLines),
      entries,
    });
    section = null;
    entries = [];
  };

  const closeRelease = () => {
    if (!release) return;
    closeSection();
    releases.push({
      version: release.version,
      isUnreleased: /^unreleased$/iu.test(release.version),
      date: release.date,
      upstreamVersion: release.upstreamVersion,
      note: joinNote(release.noteLines),
      sections: release.sections,
    });
    release = null;
  };

  for (const rawLine of markdown.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (insideHtmlComment) {
      if (line.includes("-->")) insideHtmlComment = false;
      continue;
    }
    if (line.startsWith("<!--")) {
      if (!line.includes("-->")) insideHtmlComment = true;
      continue;
    }

    const releaseHeading = RELEASE_HEADING.exec(line);
    if (releaseHeading) {
      closeRelease();
      const heading = releaseHeading[1] ?? "";
      const dated = RELEASE_DATE_SUFFIX.exec(heading);
      release = {
        version: (dated ? (dated[1] ?? heading) : heading).trim(),
        date: dated ? (dated[2] ?? null) : null,
        upstreamVersion: null,
        noteLines: [],
        sections: [],
      };
      continue;
    }

    if (!release) continue;

    const sectionHeading = SECTION_HEADING.exec(line);
    if (sectionHeading) {
      closeSection();
      const title = (sectionHeading[1] ?? "").trim();
      section = { origin: resolveOrigin(title), title, noteLines: [] };
      continue;
    }

    const listItem = LIST_ITEM.exec(line);
    if (listItem && section) {
      closeEntry();
      entryLines = [listItem[1] ?? ""];
      continue;
    }

    if (line.length === 0) {
      closeEntry();
      continue;
    }

    if (entryLines) {
      entryLines.push(line);
      continue;
    }

    const upstreamLine = UPSTREAM_LINE.exec(line);
    if (upstreamLine && !section) {
      release.upstreamVersion = upstreamLine[1]?.trim() ?? null;
      continue;
    }

    // Prose wraps across lines in the source; rejoin it so the rendered paragraph reflows.
    (section ? section.noteLines : release.noteLines).push(line);
  }

  closeRelease();
  return releases;
}

function joinNote(lines: readonly string[]): readonly ChangelogInlineSegment[] | null {
  const note = lines.join(" ").trim();
  return note.length > 0 ? parseInlineSegments(note) : null;
}
