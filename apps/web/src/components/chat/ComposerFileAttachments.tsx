import { formatAttachmentSize } from "@t3tools/client-runtime/state/attachments";
import { FileIcon, PaperclipIcon, PlayIcon, RotateCcwIcon, XIcon } from "lucide-react";
import { useRef } from "react";

import { composerFileNeedsReattach, type ComposerFileAttachment } from "../../composerDraftStore";
import {
  formatAttachmentUploadProgress,
  type AttachmentUploadState,
} from "../../lib/attachmentUploadState";
import { isVideoAttachment } from "../../types";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Composer rows for generic file attachments: name, size or upload progress,
 * retry on failure, and remove. A file hydrated without a finished upload
 * shows "Attach again" until the user re-picks or removes it.
 */
export function ComposerFileAttachmentRows(props: {
  readonly files: ReadonlyArray<ComposerFileAttachment>;
  readonly uploadsByAttachmentId: Readonly<Record<string, AttachmentUploadState>> | null;
  readonly fileStagingLimit: number | null;
  readonly onRetry: (file: ComposerFileAttachment) => void;
  readonly onRemove: (fileId: string) => void;
  /** Plays a video that still has its local bytes. */
  readonly onPlayVideo: (file: ComposerFileAttachment & { readonly file: File }) => void;
}) {
  if (props.files.length === 0) {
    return null;
  }
  return (
    <div className="mb-3 flex flex-col gap-1">
      {props.files.map((file) => {
        const upload = props.uploadsByAttachmentId?.[file.id];
        const needsReattach = composerFileNeedsReattach(file);
        const canReattach =
          props.fileStagingLimit !== null && file.sizeBytes <= props.fileStagingLimit;
        return (
          <div
            key={file.id}
            className="flex min-w-0 items-center gap-2 py-1 text-sm text-foreground"
          >
            {file.file !== null && isVideoAttachment(file) ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => {
                  if (file.file !== null) props.onPlayVideo({ ...file, file: file.file });
                }}
                aria-label={`Play ${file.name}`}
              >
                <PlayIcon />
              </Button>
            ) : (
              <FileIcon className="size-4 shrink-0 text-muted-foreground" />
            )}
            <span className="min-w-0 flex-1 truncate">{file.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {needsReattach
                ? canReattach
                  ? "Attach again"
                  : "Remove to send"
                : upload?.status === "uploading"
                  ? formatAttachmentUploadProgress(upload.progress)
                  : formatAttachmentSize(file.sizeBytes)}
            </span>
            {!needsReattach && upload?.status === "failed" ? (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => props.onRetry(file)}
                      aria-label={`Retry upload for ${file.name}`}
                    />
                  }
                >
                  <RotateCcwIcon />
                </TooltipTrigger>
                <TooltipPopup side="top" className="max-w-64 whitespace-normal leading-tight">
                  {upload.reason}
                </TooltipPopup>
              </Tooltip>
            ) : null}
            <Button
              variant="ghost"
              size="icon-xs"
              onClick={() => props.onRemove(file.id)}
              aria-label={`Remove ${file.name}`}
            >
              <XIcon />
            </Button>
          </div>
        );
      })}
    </div>
  );
}

/** Paperclip button that opens the system file picker for any file type. */
export function ComposerAttachFilesButton(props: {
  readonly disabled?: boolean;
  readonly onFiles: (files: File[]) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.currentTarget.files ?? []);
          // Reset so picking the same file again still fires `change`.
          event.currentTarget.value = "";
          if (files.length > 0) {
            props.onFiles(files);
          }
        }}
      />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={props.disabled}
              // Keep the editor's selection so focus returns where it was.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => inputRef.current?.click()}
              aria-label="Attach files"
            />
          }
        >
          <PaperclipIcon />
        </TooltipTrigger>
        <TooltipPopup>Attach files</TooltipPopup>
      </Tooltip>
    </>
  );
}
