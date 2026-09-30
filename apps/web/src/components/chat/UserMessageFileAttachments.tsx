import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { DownloadIcon, EyeIcon, FileIcon, PlayIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { downloadAttachmentFromUrl, loadAttachmentBlobUrl } from "../../lib/attachmentDownload";
import {
  type ChatAttachment,
  type ChatFileAttachment,
  isBrowserPreviewAttachment,
  isVideoAttachment,
} from "../../types";
import { toastManager } from "../ui/toast";
import type { ExpandedImagePreview } from "./ExpandedImagePreview";

/**
 * Plays a sent video. The desktop window only loads media from its own
 * scheme and `blob:`, so the bytes are read into a blob URL first; the
 * dialog owner revokes it when the preview closes.
 */
function UserMessageVideoTile(props: {
  readonly file: ChatFileAttachment;
  readonly onExpand: (preview: ExpandedImagePreview) => void;
}) {
  const { file } = props;
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  useEffect(() => () => abortRef.current?.abort(), []);
  const previewUrl = file.downloadable === false ? undefined : file.previewUrl;
  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-black">
      <button
        type="button"
        disabled={!previewUrl}
        className="flex min-h-[72px] w-full cursor-zoom-in flex-col items-center justify-center gap-1 px-2 py-2 text-white disabled:cursor-default disabled:opacity-50 aria-disabled:cursor-default aria-disabled:opacity-50"
        aria-busy={loading || undefined}
        aria-disabled={loading || undefined}
        aria-label={`${loading ? "Loading" : "Play"} ${file.name}`}
        onClick={() => {
          if (loading || !previewUrl) return;
          const controller = new AbortController();
          abortRef.current = controller;
          setLoading(true);
          loadAttachmentBlobUrl(previewUrl, controller.signal)
            .then((src) => {
              if (controller.signal.aborted) {
                URL.revokeObjectURL(src);
                return;
              }
              props.onExpand({ images: [{ src, name: file.name, type: "video" }], index: 0 });
            })
            .catch((cause: unknown) => {
              if (controller.signal.aborted) return;
              toastManager.add({
                type: "error",
                title: `Could not play ${file.name}`,
                description: cause instanceof Error ? cause.message : "The video is unavailable.",
              });
            })
            .finally(() => {
              if (!controller.signal.aborted) setLoading(false);
            });
        }}
      >
        {loading ? (
          <span className="text-[11px]">Loading…</span>
        ) : (
          <PlayIcon className="size-8 fill-current" />
        )}
        <span className="max-w-full truncate text-[11px]">{file.name}</span>
      </button>
    </div>
  );
}

/**
 * Generic file attachments on a sent user message: videos as play tiles,
 * everything else as download rows, plus inert rows for attachment types
 * this build does not know.
 */
export function UserMessageFileAttachments(props: {
  readonly files: ReadonlyArray<ChatFileAttachment>;
  readonly unknownAttachments: ReadonlyArray<ChatAttachment>;
  readonly onExpand?: (preview: ExpandedImagePreview) => void;
  /** Opens a PDF or HTML file in the file viewer. Absent: those download too. */
  readonly onPreview?: (file: ChatFileAttachment) => void;
}) {
  const { onExpand, onPreview } = props;
  const videos = onExpand ? props.files.filter(isVideoAttachment) : [];
  const files = props.files.filter((file) => !videos.includes(file));
  if (videos.length === 0 && files.length === 0 && props.unknownAttachments.length === 0) {
    return null;
  }
  return (
    <>
      {videos.length > 0 && onExpand ? (
        <div className="mb-2 grid max-w-[420px] grid-cols-2 gap-2">
          {videos.map((file) => (
            <UserMessageVideoTile key={file.id} file={file} onExpand={onExpand} />
          ))}
        </div>
      ) : null}
      {files.length > 0 || props.unknownAttachments.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1">
          {files.map((file) => {
            const content = (
              <>
                <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate">{file.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {formatAttachmentSize(file.sizeBytes)}
                </span>
                {file.downloadable === false || !file.previewUrl ? null : (
                  <DownloadIcon className="size-4 shrink-0" />
                )}
              </>
            );
            const previewUrl = file.downloadable === false ? undefined : file.previewUrl;
            if (onPreview && previewUrl && isBrowserPreviewAttachment(file)) {
              return (
                <div key={file.id} className="flex min-w-0 items-center gap-1">
                  <button
                    type="button"
                    aria-label={`Preview ${file.name}`}
                    onClick={() => onPreview(file)}
                    className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-md py-1 text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
                  >
                    <FileIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <EyeIcon className="size-4 shrink-0" />
                  </button>
                  <button
                    type="button"
                    aria-label={`Download ${file.name}`}
                    onClick={() => {
                      void downloadAttachmentFromUrl(previewUrl, file.name).catch(
                        (cause: unknown) => {
                          toastManager.add({
                            type: "error",
                            title: `Could not download ${file.name}`,
                            description:
                              cause instanceof Error ? cause.message : "The file is unavailable.",
                          });
                        },
                      );
                    }}
                    className="grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
                  >
                    <DownloadIcon className="size-4" />
                  </button>
                </div>
              );
            }
            return previewUrl ? (
              <button
                key={file.id}
                type="button"
                aria-label={`Download ${file.name}`}
                onClick={() => {
                  void downloadAttachmentFromUrl(previewUrl, file.name).catch((cause: unknown) => {
                    toastManager.add({
                      type: "error",
                      title: `Could not download ${file.name}`,
                      description:
                        cause instanceof Error ? cause.message : "The file is unavailable.",
                    });
                  });
                }}
                className="flex min-w-0 cursor-pointer items-center gap-2 rounded-md py-1 text-left text-sm hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/70"
              >
                {content}
              </button>
            ) : (
              <div key={file.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
                {content}
              </div>
            );
          })}
          {props.unknownAttachments.map((attachment) => (
            <div key={attachment.id} className="flex min-w-0 items-center gap-2 py-1 text-sm">
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
