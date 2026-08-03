import { toComparableWorkspacePath, workspaceRelativePathWithin } from "~/workspacePathMatch";
import type { FileSurfaceRoot } from "./externalFileRoot";

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
 * first, asking whether the path lands inside a registered project from there.
 * A registered project is the whole test. Anchoring on a bare folder would
 * invent a repo out of any two matching segments, and the answer has to be one
 * the user would recognise.
 *
 * This runs only after the thread's own read has already failed, which is what
 * keeps it from ever outranking a file that is really there.
 */
const DRIVE_ROOT_PATTERN = /^[A-Za-z]:$/;

export function resolveCrossRepoFileFallback(
  workspaceRoot: string,
  relativePath: string,
  projectRoots: readonly string[],
): FileSurfaceRoot | null {
  const normalizedRoot = toComparableWorkspacePath(workspaceRoot);
  const normalizedRelativePath = toComparableWorkspacePath(relativePath);
  if (normalizedRoot.length === 0 || normalizedRelativePath.length === 0) return null;

  const segments = normalizedRoot.split("/");
  // Ancestors only, and never the drive or filesystem root: nobody writes a
  // path relative to `C:\`, and anchoring there would search the whole disk.
  for (let depth = segments.length - 1; depth > 0; depth--) {
    const ancestor = segments.slice(0, depth).join("/");
    if (ancestor.length === 0 || DRIVE_ROOT_PATTERN.test(ancestor)) continue;
    const owner = deepestOwningProject(
      `${ancestor}/${normalizedRelativePath}`,
      projectRoots,
      normalizedRoot,
    );
    if (owner) return owner;
  }
  return null;
}

/**
 * The most specific registered project holding `absolutePath`, skipping the
 * thread's own workspace because resolving there is what already failed.
 */
function deepestOwningProject(
  absolutePath: string,
  projectRoots: readonly string[],
  excludedRoot: string,
): FileSurfaceRoot | null {
  let best: FileSurfaceRoot | null = null;
  let bestRootLength = -1;
  for (const projectRoot of projectRoots) {
    const normalizedProjectRoot = toComparableWorkspacePath(projectRoot);
    if (normalizedProjectRoot.toLowerCase() === excludedRoot.toLowerCase()) continue;
    const relativePath = workspaceRelativePathWithin(projectRoot, absolutePath);
    if (relativePath === null) continue;
    if (normalizedProjectRoot.length <= bestRootLength) continue;
    best = { root: projectRoot, relativePath };
    bestRootLength = normalizedProjectRoot.length;
  }
  return best;
}
