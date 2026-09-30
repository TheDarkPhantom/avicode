import { RotateCcwIcon } from "lucide-react";

import {
  formatAttachmentUploadProgress,
  type AttachmentUploadState,
} from "../../lib/attachmentUploadState";
import { Button } from "../ui/button";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Upload progress and retry overlay for a square composer attachment tile.
 * Renders nothing when the attachment is not uploading or failed.
 */
export function ComposerAttachmentUploadStatus(props: {
  readonly upload: AttachmentUploadState | undefined;
  readonly name: string;
  readonly onRetry: () => void;
}) {
  const { upload } = props;
  if (upload?.status === "uploading") {
    return (
      <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-background/85 px-1 text-center text-[10px] text-foreground">
        {formatAttachmentUploadProgress(upload.progress)}
      </span>
    );
  }
  if (upload?.status === "failed") {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="ghost"
              size="icon-xs"
              className="absolute bottom-1 left-1 bg-background/85 hover:bg-background/95"
              onClick={props.onRetry}
              aria-label={`Retry upload for ${props.name}`}
            />
          }
        >
          <RotateCcwIcon />
        </TooltipTrigger>
        <TooltipPopup side="top" className="max-w-64 whitespace-normal leading-tight">
          {upload.reason}
        </TooltipPopup>
      </Tooltip>
    );
  }
  return null;
}
