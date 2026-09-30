/**
 * Reads an asset into a same-origin blob URL. The desktop window only loads
 * media from its own scheme and `blob:`, so a video plays from one of these.
 * The caller owns the URL and revokes it.
 */
export async function loadAttachmentBlobUrl(url: string, signal?: AbortSignal): Promise<string> {
  const response = await fetch(url, signal ? { signal } : {});
  if (!response.ok) {
    throw new Error(`The server returned ${response.status}.`);
  }
  return URL.createObjectURL(await response.blob());
}

/**
 * Saves an attachment from its signed asset URL under its display name.
 *
 * The asset lives on the environment's HTTP origin, not the renderer's, so a
 * plain `<a download>` would be a cross-origin navigation (which the desktop
 * shell hands to the system browser). Reading the bytes into a same-origin
 * blob URL keeps the save inside the app.
 */
export async function downloadAttachmentFromUrl(url: string, fileName: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`The server returned ${response.status}.`);
  }
  const objectUrl = URL.createObjectURL(await response.blob());
  try {
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = fileName;
    anchor.click();
  } finally {
    // The download reads the blob asynchronously after the click; keep the
    // URL alive long enough for the save to start before releasing it.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
  }
}
