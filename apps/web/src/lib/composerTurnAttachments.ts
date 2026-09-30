import type {
  ChatAttachment as ContractChatAttachment,
  EnvironmentId,
  UploadChatAttachment,
} from "@t3tools/contracts";

import type { ComposerAttachment } from "../composerDraftStore";
import type { ChatAttachment } from "../types";
import { readFileAsDataUrl } from "../components/ChatView.logic";
import {
  awaitAttachmentUploads,
  readAttachmentUpload,
  readUploadedAttachmentId,
  startAttachmentUpload,
  type UploadableComposerAttachment,
} from "./attachmentUploadQueue";

/**
 * Avi Code addition: one place that turns composer attachments into the turn
 * payload, shared by every send path (normal send, plan follow-up, fork edit).
 * Upstream builds these inline in the send handler.
 */
export type TurnAttachmentInput = UploadChatAttachment | ContractChatAttachment;

/** Composer attachments whose bytes go through the upload queue. */
export function uploadableComposerAttachments(
  attachments: ReadonlyArray<ComposerAttachment>,
): UploadableComposerAttachment[] {
  return attachments.filter(
    (attachment): attachment is UploadableComposerAttachment => attachment.type === "image",
  );
}

/**
 * Starts (or joins) the uploads a send needs and waits for them. Returns the
 * error to show when any of them did not finish, or null when all are ready.
 */
export async function settleComposerAttachmentUploads(input: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
}): Promise<string | null> {
  const uploadable = uploadableComposerAttachments(input.attachments);
  if (uploadable.length === 0) {
    return null;
  }
  for (const attachment of uploadable) {
    startAttachmentUpload({ environmentId: input.environmentId, attachment });
  }
  await awaitAttachmentUploads(uploadable.map((attachment) => attachment.id));
  const failed = uploadable.find(
    (attachment) => readUploadedAttachmentId(input.environmentId, attachment.id) === null,
  );
  if (!failed) {
    return null;
  }
  const upload = readAttachmentUpload(failed.id);
  const reason = upload?.status === "failed" ? ` (${upload.reason})` : "";
  return `'${failed.name}' did not upload${reason}. Retry or remove it before sending.`;
}

/**
 * The turn payload for the composer's attachments. With `useUploads`, images
 * reference their finished pending upload (call
 * `settleComposerAttachmentUploads` first); without it they ride inline.
 */
export async function buildComposerTurnAttachments(input: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ComposerAttachment>;
  readonly useUploads: boolean;
}): Promise<TurnAttachmentInput[]> {
  return Promise.all(
    input.attachments.map(async (attachment): Promise<TurnAttachmentInput> => {
      if (attachment.type === "document") {
        return {
          type: "document",
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          extractedText: attachment.extractedText,
        };
      }
      if (input.useUploads) {
        const id = readUploadedAttachmentId(input.environmentId, attachment.id);
        if (id === null) {
          throw new Error(`'${attachment.name}' did not finish uploading.`);
        }
        return {
          type: "image",
          id,
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        };
      }
      return {
        type: "image",
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        dataUrl: await readFileAsDataUrl(attachment.file),
      };
    }),
  );
}

/** The optimistic timeline copy of the composer's attachments. */
export function optimisticComposerAttachments(
  attachments: ReadonlyArray<ComposerAttachment>,
): ChatAttachment[] {
  return attachments.map((attachment): ChatAttachment => {
    if (attachment.type === "document") {
      return {
        type: "document",
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        extractedChars: attachment.extractedChars,
      };
    }
    return {
      type: "image",
      id: attachment.id,
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      previewUrl: attachment.previewUrl,
    };
  });
}
