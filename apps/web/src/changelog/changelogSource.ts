// Avi Code addition: the repository's CHANGELOG.md is the single source of truth, bundled as text
// so the app never has to reach the network (or a GitHub release) to show what changed.
import changelogMarkdown from "../../../../CHANGELOG.md?raw";

import { parseChangelog } from "./parseChangelog";

export const CHANGELOG_MARKDOWN = changelogMarkdown;
export const CHANGELOG_RELEASES = parseChangelog(changelogMarkdown);
