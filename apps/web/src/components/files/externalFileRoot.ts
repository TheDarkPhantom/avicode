import {
  isAbsoluteWorkspacePath,
  toComparableWorkspacePath,
  workspacePathDirname,
  workspaceRelativePathWithin,
} from "~/workspacePathMatch";

/**
 * Avi Code addition: picks the folder the file viewer should open a file
 * against.
 *
 * The viewer used to be pinned to one root per thread, so a file an agent read
 * or edited in another repo could not be opened at all: the click quietly fell
 * back to launching an external editor. Agents routinely work across repos, so
 * that meant leaving the app to read a document that was just mentioned.
 *
 * Registered projects win, and the deepest match wins among them, so a project
 * nested inside another resolves to the inner one and the tree shows the repo
 * the user recognises. Anything else falls back to the file's own folder, which
 * still gives a working viewer and a small, honest tree.
 */
export interface FileSurfaceRoot {
  readonly root: string;
  readonly relativePath: string;
}

export function resolveFileSurfaceRoot(
  absolutePath: string,
  projectRoots: readonly string[],
): FileSurfaceRoot | null {
  if (!isAbsoluteWorkspacePath(absolutePath)) return null;

  let best: FileSurfaceRoot | null = null;
  let bestRootLength = -1;
  for (const projectRoot of projectRoots) {
    const relativePath = workspaceRelativePathWithin(projectRoot, absolutePath);
    if (relativePath === null) continue;
    const rootLength = toComparableWorkspacePath(projectRoot).length;
    if (rootLength <= bestRootLength) continue;
    best = { root: projectRoot, relativePath };
    bestRootLength = rootLength;
  }
  if (best) return best;

  const parent = workspacePathDirname(absolutePath);
  const relativePath = workspaceRelativePathWithin(parent, absolutePath);
  if (relativePath === null) return null;
  return { root: parent, relativePath };
}
