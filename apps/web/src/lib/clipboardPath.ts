import { isWindowsAbsolutePath } from "@t3tools/shared/path";

/**
 * A copied file path uses the separators of the host that owns the file, so a
 * workspace-relative `src/app.ts` on a Windows host copies as `src\app.ts`.
 * `hostPath` is any absolute path on that host (the file itself or its cwd).
 */
export function formatFilePathForClipboard(path: string, hostPath = path): string {
  return isWindowsAbsolutePath(hostPath) ? path.replaceAll("/", "\\") : path;
}
