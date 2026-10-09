import type { AssetResource, ScopedThreadRef } from "@t3tools/contracts";

export const isMarkdownPreviewFile = (path: string): boolean => /\.(?:md|mdx)$/i.test(path);

export function setMarkdownTaskChecked(
  markdown: string,
  markerOffset: number,
  checked: boolean,
): string {
  if (
    markerOffset < 0 ||
    markdown[markerOffset] !== "[" ||
    !/[ xX]/.test(markdown[markerOffset + 1] ?? "") ||
    markdown[markerOffset + 2] !== "]"
  ) {
    return markdown;
  }

  return `${markdown.slice(0, markerOffset + 1)}${checked ? "x" : " "}${markdown.slice(markerOffset + 2)}`;
}

/**
 * The signed-asset resource for a workspace file the panel renders in place
 * (image, HTML, PDF).
 *
 * The server resolves a plain workspace file through its thread, which a draft
 * does not have yet, so a draft names its workspace root explicitly. A surface
 * showing another repository does the same. The server honours an explicit root
 * only when it names a registered project.
 */
export function workspaceAssetResource(input: {
  readonly threadRef: ScopedThreadRef;
  /** The thread is a draft the server does not know yet. */
  readonly draft: boolean;
  /** The surface shows another repository's root rather than the thread's. */
  readonly externalRoot: boolean;
  readonly workspaceRoot: string;
  readonly absolutePath: string;
}): Extract<AssetResource, { readonly _tag: "workspace-file" }> {
  return {
    _tag: "workspace-file",
    threadId: input.threadRef.threadId,
    path: input.absolutePath,
    ...(input.draft || input.externalRoot ? { workspaceRoot: input.workspaceRoot } : {}),
  };
}
