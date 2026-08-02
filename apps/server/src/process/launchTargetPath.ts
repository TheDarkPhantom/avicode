// @effect-diagnostics nodeBuiltinImport:off
import * as NodePath from "node:path";

/**
 * Avi Code addition: path helpers that answer for a *named* platform rather than
 * the host the process happens to run on.
 *
 * The external launcher needs this because a launch target can arrive in shapes
 * the OS file manager cannot use, and it never says so: it just opens the user's
 * default folder. Git reports forward-slashed Windows paths, markdown and
 * terminal links append `:line:column`, and the diff panel can send a
 * repo-relative path. Editors parse their own arguments and complain when they
 * are wrong, so only the file manager needs protecting, but normalizing for
 * everyone costs nothing.
 *
 * Parameterizing on platform rather than reading the Effect `Path` service keeps
 * these testable for all three platforms from whichever host runs the suite.
 * The node builtin is used directly, as `@t3tools/shared/shell` already does,
 * because `Path.Path` is bound to the host and cannot answer for the others.
 */
export function normalizePathForPlatform(value: string, platform: NodeJS.Platform): string {
  if (platform !== "win32") return NodePath.posix.normalize(value);
  return NodePath.win32.normalize(value.replaceAll("/", "\\"));
}

export function isAbsolutePathForPlatform(value: string, platform: NodeJS.Platform): boolean {
  return platform === "win32" ? NodePath.win32.isAbsolute(value) : NodePath.posix.isAbsolute(value);
}

export function parentDirectoryForPlatform(value: string, platform: NodeJS.Platform): string {
  return platform === "win32" ? NodePath.win32.dirname(value) : NodePath.posix.dirname(value);
}
