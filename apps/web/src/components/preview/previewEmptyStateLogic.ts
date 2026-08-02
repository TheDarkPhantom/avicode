import type { PreviewSessionSnapshot, ProjectScript } from "@t3tools/contracts";

export function shouldShowPreviewEmptyState(snapshot: PreviewSessionSnapshot | null): boolean {
  return snapshot === null || snapshot.navStatus._tag === "Idle";
}

/**
 * Avi Code addition: the script name travels with its URL now.
 *
 * A configured preview URL was tracked as such and sorted first, but the row
 * label fell back to the process name, so a live one rendered as a bare "node"
 * and the fact that it came from this project's own scripts was invisible.
 */
export interface ConfiguredPreviewUrl {
  readonly url: string;
  readonly scriptName: string;
}

export function getConfiguredPreviewUrls(
  scripts: ReadonlyArray<ProjectScript> | undefined,
): ReadonlyArray<ConfiguredPreviewUrl> {
  return (
    scripts?.flatMap((script) =>
      script.previewUrl ? [{ url: script.previewUrl, scriptName: script.name }] : [],
    ) ?? []
  );
}
