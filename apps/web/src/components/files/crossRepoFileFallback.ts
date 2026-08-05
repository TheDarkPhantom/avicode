import { toComparableWorkspacePath } from "~/workspacePathMatch";

/**
 * Avi Code addition: finds the repo a thread-relative path really belongs to.
 *
 * A path an agent writes without a leading slash is joined onto the thread's own
 * workspace, which is right almost always and wrong exactly when the agent was
 * quoting another repo. `dev/ALFRED-CODE/docs/x.md` mentioned in a thread rooted
 * at `.../dev/advisoravi-business` becomes
 * `.../dev/advisoravi-business/dev/ALFRED-CODE/docs/x.md`, which does not exist,
 * so the file viewer opened onto a read failure. The cross-repo resolver could
 * not help: it only runs for paths already known to sit outside the workspace,
 * and this one looks like it sits inside.
 *
 * The paths that go wrong this way are written relative to some folder above the
 * thread's workspace, so that is what this walks: each ancestor in turn, deepest
 * first. The server then verifies those candidates and identifies the owning
 * registered project, Git repository, or file parent.
 *
 * This runs only after the thread's own read has already failed, which is what
 * keeps it from ever outranking a file that is really there.
 */
const DRIVE_ROOT_PATTERN = /^[A-Za-z]:$/;

export function buildAncestorFileCandidates(
  workspaceRoot: string,
  relativePath: string,
): readonly string[] {
  const normalizedRoot = toComparableWorkspacePath(workspaceRoot);
  const normalizedRelativePath = toComparableWorkspacePath(relativePath);
  if (normalizedRoot.length === 0 || normalizedRelativePath.length === 0) return [];

  const segments = normalizedRoot.split("/");
  const candidates: string[] = [];
  for (let depth = segments.length - 1; depth > 0; depth--) {
    const ancestor = segments.slice(0, depth).join("/");
    if (ancestor.length === 0 || DRIVE_ROOT_PATTERN.test(ancestor)) continue;
    candidates.push(`${ancestor}/${normalizedRelativePath}`);
  }
  return candidates;
}
