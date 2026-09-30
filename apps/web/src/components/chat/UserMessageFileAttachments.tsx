import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { DownloadIcon, FileIcon } from "lucide-react";

import { downloadAttachmentFromUrl } from "../../lib/attachmentDownload";
import type { ChatAttachment, ChatFileAttachment } from "../../types";
import { toastManager } from "../ui/toast";

/**
 * Generic file attachments on a sent user message, as download rows, plus
 * inert rows for attachment types this build does not know.
 */
export function UserMessageFileAttachments(props: {
  readonly files: ReadonlyArray<ChatFileAttachment>;
  readonly unknownAttachments: ReadonlyArray<ChatAttachment>;
}) {
  if (props.files.length === 0 && props.unknownAttachments.length === 0) {
    return null;
  }
  return (
    <div className="mb-2 flex flex-col gap-1">
      {props.files.map((file) => {
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
                  description: cause instanceof Error ? cause.message : "The file is unavailable.",
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
  );
}
