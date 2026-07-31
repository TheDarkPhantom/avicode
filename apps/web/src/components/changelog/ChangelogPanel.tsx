import { GitMergeIcon, SparklesIcon } from "lucide-react";
import { memo } from "react";

import {
  resolveChangelogPullRequestUrl,
  UPSTREAM_PROJECT_NAME,
} from "../../changelog/changelogLinks";
import { CHANGELOG_RELEASES } from "../../changelog/changelogSource";
import type {
  ChangelogEntry,
  ChangelogInlineSegment,
  ChangelogOrigin,
  ChangelogRelease,
  ChangelogSection,
} from "../../changelog/parseChangelog";
import { APP_BASE_NAME, APP_VERSION } from "../../branding";
import { cn } from "../../lib/utils";
import { Badge } from "../ui/badge";

/**
 * Avi Code addition. Upstream ships no in-app changelog; this fork needs one because a sync merge
 * lands dozens of upstream commits alongside its own work, and the useful question afterwards is
 * always "was that us or upstream?". Sections are rendered per origin and pull request numbers
 * link back to whichever repository they were opened in.
 */

const ORIGIN_ICON: Record<ChangelogOrigin, typeof SparklesIcon> = {
  avicode: SparklesIcon,
  upstream: GitMergeIcon,
};

/** Keys segments by their character offset in the original line, which is stable and unique. */
function keyedSegments(segments: readonly ChangelogInlineSegment[]) {
  let offset = 0;
  return segments.map((segment) => {
    const key = offset;
    offset += segment.text.length;
    return { key, segment };
  });
}

function InlineText({ segments }: { segments: readonly ChangelogInlineSegment[] }) {
  return (
    <>
      {keyedSegments(segments).map(({ key, segment }) => {
        if (segment.kind === "code") {
          return (
            <code
              key={key}
              className="rounded-sm bg-muted px-1 py-px font-mono text-[0.85em] text-foreground"
            >
              {segment.text}
            </code>
          );
        }
        if (segment.kind === "link") {
          return (
            <a
              key={key}
              className="underline underline-offset-2 hover:text-foreground"
              href={segment.url}
              rel="noreferrer noopener"
              target="_blank"
            >
              {segment.text}
            </a>
          );
        }
        return <span key={key}>{segment.text}</span>;
      })}
    </>
  );
}

function plainText(segments: readonly ChangelogInlineSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}

function ChangelogEntryRow({ entry, origin }: { entry: ChangelogEntry; origin: ChangelogOrigin }) {
  return (
    <li className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="min-w-0 flex-1 text-[13px] leading-[1.5] text-foreground">
        <InlineText segments={entry.summary} />
      </span>
      <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
        {entry.author ? <span className="truncate">{entry.author}</span> : null}
        {entry.pullRequest === null ? null : (
          <a
            className="font-mono tabular-nums underline-offset-2 hover:text-foreground hover:underline"
            href={resolveChangelogPullRequestUrl(origin, entry.pullRequest)}
            rel="noreferrer noopener"
            target="_blank"
          >
            #{entry.pullRequest}
          </a>
        )}
      </span>
    </li>
  );
}

function ChangelogSectionBlock({ section }: { section: ChangelogSection }) {
  const Icon = ORIGIN_ICON[section.origin];

  return (
    <section className="space-y-1">
      <h3
        className={cn(
          "flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase",
          section.origin === "avicode" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        <Icon className="size-3.5" />
        {section.title}
      </h3>
      {section.note ? (
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          <InlineText segments={section.note} />
        </p>
      ) : null}
      <ul className="divide-y divide-border/40">
        {section.entries.map((entry) => (
          <ChangelogEntryRow
            key={entry.pullRequest ?? plainText(entry.summary)}
            entry={entry}
            origin={section.origin}
          />
        ))}
      </ul>
    </section>
  );
}

function ChangelogReleaseBlock({
  release,
  isCurrent,
}: {
  release: ChangelogRelease;
  isCurrent: boolean;
}) {
  return (
    <article className="space-y-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
        <h2 className="text-lg font-semibold tracking-[-0.025em] text-foreground">
          {release.isUnreleased ? "Unreleased" : release.version}
        </h2>
        {isCurrent ? (
          <Badge size="sm" variant="secondary">
            Installed
          </Badge>
        ) : null}
        {release.date ? (
          <span className="text-xs text-muted-foreground tabular-nums">{release.date}</span>
        ) : null}
        {release.upstreamVersion ? (
          <span className="ms-auto text-xs text-muted-foreground">
            on {UPSTREAM_PROJECT_NAME} {release.upstreamVersion}
          </span>
        ) : null}
      </header>
      {release.note ? (
        <p className="text-[13px] leading-[1.5] text-muted-foreground">
          <InlineText segments={release.note} />
        </p>
      ) : null}
      {release.sections.map((section) => (
        <ChangelogSectionBlock key={section.title} section={section} />
      ))}
    </article>
  );
}

export const ChangelogPanel = memo(function ChangelogPanel() {
  return (
    <div className="settings-page-scroll-fade scrollbar-gutter-both flex-1 overflow-y-auto px-4 pt-10 pb-7 sm:px-8 sm:pt-12 sm:pb-10">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-10">
        <header className="space-y-2">
          {/* The page chrome already shows "Changelog"; this keeps the landmark without repeating it. */}
          <h1 className="sr-only">Changelog</h1>
          <p className="max-w-2xl text-[13px] leading-[1.5] text-muted-foreground">
            {APP_BASE_NAME} is a fork of {UPSTREAM_PROJECT_NAME}, so each release lists what this
            fork changed and what a sync merge brought in from upstream, credited to whoever wrote
            it. Versions ride the upstream line: {APP_VERSION} is an {APP_BASE_NAME} build of the
            upstream release it names.
          </p>
        </header>

        {CHANGELOG_RELEASES.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">No releases have been recorded yet.</p>
        ) : (
          CHANGELOG_RELEASES.map((release) => (
            <ChangelogReleaseBlock
              key={release.version}
              isCurrent={release.version === APP_VERSION}
              release={release}
            />
          ))
        )}
      </div>
    </div>
  );
});
