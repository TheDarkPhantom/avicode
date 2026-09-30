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
    // The click starts the download synchronously; the bytes are copied by
    // then, so the URL can go on the next task.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
}
