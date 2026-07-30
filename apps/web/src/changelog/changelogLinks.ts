import { AVICODE_IDENTITY } from "@t3tools/shared/avicodeIdentity";

import type { ChangelogOrigin } from "./parseChangelog";

/**
 * Avi Code addition: the changelog credits work per origin, so a pull request number has to
 * resolve against the repository it was actually opened in. Both slugs come from the identity
 * module rather than being spelled out here.
 */
const REPOSITORY_SLUG: Record<ChangelogOrigin, string> = {
  avicode: AVICODE_IDENTITY.releaseSlug,
  upstream: AVICODE_IDENTITY.upstreamRepository,
};

/** The upstream project's short name, e.g. `t3code`, taken from its repository slug. */
export const UPSTREAM_PROJECT_NAME =
  AVICODE_IDENTITY.upstreamRepository.split("/").at(-1) ?? AVICODE_IDENTITY.upstreamRepository;

export function resolveChangelogRepositoryUrl(origin: ChangelogOrigin): string {
  return `https://github.com/${REPOSITORY_SLUG[origin]}`;
}

export function resolveChangelogPullRequestUrl(
  origin: ChangelogOrigin,
  pullRequest: number,
): string {
  return `${resolveChangelogRepositoryUrl(origin)}/pull/${pullRequest}`;
}
