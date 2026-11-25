import { T, useGT } from "gt-react";

import { APP_VERSION } from "../../branding";
import { CHANGELOG_RELEASES, changelogPullRequestUrl } from "../../changelog/changelogSource";
import type {
  ChangelogEntry,
  ChangelogInlineSegment,
  ChangelogOrigin,
  ChangelogRelease,
  ChangelogSection,
} from "../../changelog/parseChangelog";
import { cn } from "../../lib/utils";
import { AppRouteModal, AppRouteModalClose } from "../AppRouteModal";
import { Badge } from "../ui/badge";
import { ScrollArea } from "../ui/scroll-area";
import { WorkspacePageContainer } from "../WorkspacePageContainer";

const FORK_NAME = "Avi Code";
const UPSTREAM_NAME = "T3 Code";

function keyedSegments(segments: readonly ChangelogInlineSegment[]) {
  let offset = 0;
  return segments.map((segment) => {
    const key = offset;
    offset += segment.text.length;
    return { key, segment };
  });
}

function InlineText({ segments }: { segments: readonly ChangelogInlineSegment[] }) {
  return keyedSegments(segments).map(({ key, segment }) => {
    if (segment.kind === "code") {
      return (
        <code key={key} className="rounded-sm bg-muted px-1 py-px font-mono text-xs">
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
  });
}

function EntryRow({ entry, origin }: { entry: ChangelogEntry; origin: ChangelogOrigin }) {
  return (
    <li className="flex flex-col gap-0.5 py-1.5 sm:flex-row sm:items-baseline sm:gap-2">
      <span className="min-w-0 flex-1 text-sm leading-normal text-foreground">
        <InlineText segments={entry.summary} />
      </span>
      <span className="flex shrink-0 items-baseline gap-2 text-xs text-muted-foreground">
        {entry.author ? <span className="truncate">{entry.author}</span> : null}
        {entry.pullRequest === null ? null : (
          <a
            className="font-mono tabular-nums underline-offset-2 hover:text-foreground hover:underline"
            href={changelogPullRequestUrl(origin, entry.pullRequest)}
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

function SectionBlock({ section }: { section: ChangelogSection }) {
  return (
    <section className="flex flex-col gap-1">
      <h3
        className={cn(
          "text-xs font-semibold tracking-wide uppercase",
          section.origin === "avicode" ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {section.title}
      </h3>
      {section.note ? (
        <p className="text-sm leading-normal text-muted-foreground">
          <InlineText segments={section.note} />
        </p>
      ) : null}
      <ul className="divide-y divide-border/40">
        {section.entries.map((entry) => (
          <EntryRow
            key={entry.pullRequest ?? entry.summary.map((segment) => segment.text).join("")}
            entry={entry}
            origin={section.origin}
          />
        ))}
      </ul>
    </section>
  );
}

function ReleaseBlock({ release }: { release: ChangelogRelease }) {
  const gt = useGT();
  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-border/60 pb-2">
        <h2 className="text-lg font-semibold text-foreground">
          {release.isUnreleased ? gt("Unreleased") : release.version}
        </h2>
        {release.version === APP_VERSION ? (
          <Badge size="sm" variant="secondary">
            {gt("Installed", { $context: "badge on the version that is running now" })}
          </Badge>
        ) : null}
        {release.date ? (
          <span className="text-xs text-muted-foreground tabular-nums">{release.date}</span>
        ) : null}
        {release.upstreamVersion ? (
          <span className="ms-auto text-xs text-muted-foreground">
            {gt("Based on {upstream} {version}", {
              upstream: UPSTREAM_NAME,
              version: release.upstreamVersion,
            })}
          </span>
        ) : null}
      </header>
      {release.note ? (
        <p className="text-sm leading-normal text-muted-foreground">
          <InlineText segments={release.note} />
        </p>
      ) : null}
      {release.sections.map((section) => (
        <SectionBlock key={section.title} section={section} />
      ))}
    </article>
  );
}

export function ChangelogPage() {
  const gt = useGT();
  return (
    <AppRouteModal label={gt("Changelog")}>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-1 border-b ps-5 pe-2">
          <h1 className="min-w-0 flex-1 text-sm font-medium text-foreground">{gt("Changelog")}</h1>
          <AppRouteModalClose />
        </header>
        <ScrollArea className="min-h-0 flex-1">
          <WorkspacePageContainer className="gap-10">
            <p className="max-w-2xl text-sm leading-normal text-muted-foreground">
              {gt(
                "Each release lists what {fork} changed and what syncing with {upstream} brought in, credited to whoever wrote it.",
                { fork: FORK_NAME, upstream: UPSTREAM_NAME },
              )}
            </p>
            {CHANGELOG_RELEASES.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                <T>No releases have been recorded yet.</T>
              </p>
            ) : (
              CHANGELOG_RELEASES.map((release) => (
                <ReleaseBlock key={release.version} release={release} />
              ))
            )}
          </WorkspacePageContainer>
        </ScrollArea>
      </div>
    </AppRouteModal>
  );
}
