/**
 * Avi Code addition: comparing a filesystem path against a workspace root, in a
 * way that survives Windows.
 *
 * The rules were already proven inside `markdown-links`, which is where the file
 * viewer's prefix check lived. They moved here because cross-repo file opening
 * and the browser panel's local-server attribution both need the same answer,
 * and a third copy of "does this path sit under that folder" is how the three
 * quietly drift apart.
 *
 * Comparison is case-insensitive on every platform. That is what shipped, and it
 * is right for the Windows desktop this fork targets; two paths on a
 * case-sensitive filesystem differing only in case would match, which is not
 * worth the divergence.
 */

/** Browser URL parsing yields "/C:/foo" for a Windows file URL. */
function stripLeadingDriveSlash(path: string): string {
  return /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path;
}

export function toComparableWorkspacePath(value: string): string {
  return stripLeadingDriveSlash(value.replaceAll("\\", "/")).replace(/\/+$/, "");
}

/**
 * The path of `filePath` relative to `root`, or `null` when it sits outside.
 * Never returns a `../` escape: outside is reported as outside.
 */
export function workspaceRelativePathWithin(
  root: string | undefined,
  filePath: string,
): string | null {
  if (!root) return null;
  const normalizedRoot = toComparableWorkspacePath(root);
  const normalizedPath = toComparableWorkspacePath(filePath);
  if (normalizedRoot.length === 0) return null;
  if (!normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) return null;
  return normalizedPath.slice(normalizedRoot.length + 1);
}

/** True when `filePath` is `root` itself or sits underneath it. */
export function isWithinWorkspaceRoot(root: string | undefined, filePath: string): boolean {
  if (!root) return false;
  const normalizedRoot = toComparableWorkspacePath(root).toLowerCase();
  const normalizedPath = toComparableWorkspacePath(filePath).toLowerCase();
  if (normalizedRoot.length === 0) return false;
  return normalizedPath === normalizedRoot || normalizedPath.startsWith(`${normalizedRoot}/`);
}

/** True for a path the file viewer can anchor a root on. */
export function isAbsoluteWorkspacePath(value: string): boolean {
  const normalized = toComparableWorkspacePath(value);
  return normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized);
}

export function workspacePathBasename(value: string): string {
  const normalized = toComparableWorkspacePath(value);
  const separatorIndex = normalized.lastIndexOf("/");
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized;
}

export function workspacePathDirname(value: string): string {
  const normalized = toComparableWorkspacePath(value);
  const separatorIndex = normalized.lastIndexOf("/");
  if (separatorIndex < 0) return normalized;
  // Keep the root slash so "/a.md" yields "/" rather than "".
  return separatorIndex === 0 ? "/" : normalized.slice(0, separatorIndex);
}
