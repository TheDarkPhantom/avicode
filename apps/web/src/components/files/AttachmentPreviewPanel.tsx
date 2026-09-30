import type { AssetResource, ChatFileAttachment, EnvironmentId } from "@t3tools/contracts";
import { DownloadIcon, FileIcon, LoaderCircle } from "lucide-react";
import { useMemo } from "react";

import { useAssetUrl, useAssetUrlState } from "~/assets/assetUrls";
import { Button } from "~/components/ui/button";
import { toastManager } from "~/components/ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "~/components/ui/tooltip";
import { downloadAttachmentFromUrl } from "~/lib/attachmentDownload";

import { BrowserDocumentFrame, isPdfPreviewFile } from "./BrowserDocumentFrame";

/**
 * A sent PDF or HTML attachment rendered in the right panel. It lives in the
 * thread's attachment store rather than the workspace, so there is no path,
 * tree, or editor: only the page and a download.
 */
export default function AttachmentPreviewPanel(props: {
  readonly environmentId: EnvironmentId;
  readonly attachment: ChatFileAttachment;
}) {
  const { attachment, environmentId } = props;
  const inlineResource = useMemo<AssetResource>(
    () => ({
      _tag: "attachment",
      attachmentId: attachment.id,
      fileName: attachment.name,
      mimeType: attachment.mimeType,
      disposition: "inline",
    }),
    [attachment.id, attachment.mimeType, attachment.name],
  );
  const downloadResource = useMemo<AssetResource>(
    () => ({
      _tag: "attachment",
      attachmentId: attachment.id,
      fileName: attachment.name,
      mimeType: attachment.mimeType,
    }),
    [attachment.id, attachment.mimeType, attachment.name],
  );
  const assetUrl = useAssetUrlState(environmentId, inlineResource);
  const downloadUrl = useAssetUrl(environmentId, downloadResource);
  const pdf =
    isPdfPreviewFile(attachment.name) ||
    attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase() === "application/pdf";

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
      <div className="surface-subheader gap-2 px-3" data-surface-subheader>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 text-xs">
          <FileIcon className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="truncate font-medium">{attachment.name}</span>
          <span className="shrink-0 text-muted-foreground">Attachment</span>
        </div>
        <Tooltip>
          <TooltipTrigger
            render={
              <Button
                size="icon-xs"
                variant="ghost"
                disabled={downloadUrl === null}
                aria-label={`Download ${attachment.name}`}
                onClick={() => {
                  if (downloadUrl === null) return;
                  void downloadAttachmentFromUrl(downloadUrl, attachment.name).catch(
                    (cause: unknown) => {
                      toastManager.add({
                        type: "error",
                        title: `Could not download ${attachment.name}`,
                        description:
                          cause instanceof Error ? cause.message : "The file is unavailable.",
                      });
                    },
                  );
                }}
              />
            }
          >
            <DownloadIcon />
          </TooltipTrigger>
          <TooltipPopup side="bottom">Download {attachment.name}</TooltipPopup>
        </Tooltip>
      </div>
      {assetUrl._tag === "Failure" ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 text-center text-xs leading-relaxed text-destructive">
          Unable to load attachment preview.
        </div>
      ) : assetUrl._tag === "Success" ? (
        <BrowserDocumentFrame src={assetUrl.url} title={attachment.name} pdf={pdf} />
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center text-muted-foreground">
          <LoaderCircle className="size-5 animate-spin" />
        </div>
      )}
    </div>
  );
}
