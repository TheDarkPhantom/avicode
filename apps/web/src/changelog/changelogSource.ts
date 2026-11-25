// Bundled as text so the page never needs the network to show what changed.
import changelogMarkdown from "../../../../CHANGELOG.md?raw";

import { parseChangelog, type ChangelogOrigin } from "./parseChangelog";

export const CHANGELOG_RELEASES = parseChangelog(changelogMarkdown);

const REPOSITORY_URL: Record<ChangelogOrigin, string> = {
  avicode: "https://github.com/TheDarkPhantom/avicode",
  upstream: "https://github.com/pingdotgg/t3code",
};

export function changelogPullRequestUrl(origin: ChangelogOrigin, pullRequest: number) {
  return `${REPOSITORY_URL[origin]}/pull/${pullRequest}`;
}
