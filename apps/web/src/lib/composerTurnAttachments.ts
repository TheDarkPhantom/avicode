import type {
  ChatAttachment as ContractChatAttachment,
  EnvironmentId,
  UploadChatAttachment,
} from "@t3tools/contracts";

import {
  composerFileNeedsReattach,
  type ComposerAttachment,
  type ComposerDocumentAttachment,
  type ComposerFileAttachment,
} from "../composerDraftStore";
import {
  type ChatAttachment,
  isDocumentAttachment,
  isFileAttachment,
  isImageAttachment,
} from "../types";
import { readFileAsDataUrl } from "../components/ChatView.logic";
import { randomUUID } from "./utils";
import {
  awaitAttachmentUploads,
  forgetAttachmentUploads,
  readAttachmentUpload,
  readUploadedAttachmentId,
  releaseAttachmentUpload,
  startAttachmentUpload,
  type UploadableComposerAttachment,
} from "./attachmentUploadQueue";
import { extractDocument } from "./documentAttachments";

/**
 * Avi Code addition: one place that turns composer attachments into the turn
 * payload, shared by every send path (normal send, plan follow-up, fork edit).
 * Upstream builds these inline in the send handler.
 */
export type TurnAttachmentInput = UploadChatAttachment | ContractChatAttachment;

/** Everything the composer can send: images and documents, plus generic files. */
export type ComposerSendAttachment = ComposerAttachment | ComposerFileAttachment;

/**
 * Whether a document still holds its original bytes. Drafts persist a
 * document as its extracted text, so after a reload `file` is that text and
 * no longer matches the recorded size. Such a document sends as text only.
 */
export function composerDocumentHasOriginal(document: ComposerDocumentAttachment): boolean {
  return document.file.size === document.sizeBytes;
}

/**
 * Composer attachments whose bytes go through the upload queue. Images and
 * files always do; a document uploads its original only when the server
 * takes generic files (`fileUploadLimit`) and the original is still here.
 */
export function uploadableComposerAttachments(
  attachments: ReadonlyArray<ComposerSendAttachment>,
  fileUploadLimit: number | null,
): UploadableComposerAttachment[] {
  return attachments.filter((attachment): attachment is UploadableComposerAttachment => {
    if (attachment.type === "document") {
      return (
        fileUploadLimit !== null &&
        attachment.sizeBytes <= fileUploadLimit &&
        composerDocumentHasOriginal(attachment)
      );
    }
    if (attachment.type === "file") {
      return !composerFileNeedsReattach(attachment);
    }
    return true;
  });
}

/**
 * Starts (or joins) the uploads a send needs and waits for them. Returns the
 * error to show when any of them did not finish, or null when all are ready.
 */
export async function settleComposerAttachmentUploads(input: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ComposerSendAttachment>;
  readonly fileUploadLimit: number | null;
}): Promise<string | null> {
  const needsReattach = input.attachments.find(
    (attachment): attachment is ComposerFileAttachment =>
      attachment.type === "file" && composerFileNeedsReattach(attachment),
  );
  if (needsReattach) {
    return `Attach '${needsReattach.name}' again or remove it before sending.`;
  }
  const uploadable = uploadableComposerAttachments(input.attachments, input.fileUploadLimit);
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

function requireUploadedId(environmentId: EnvironmentId, attachment: { id: string; name: string }) {
  const id = readUploadedAttachmentId(environmentId, attachment.id);
  if (id === null) {
    throw new Error(`'${attachment.name}' did not finish uploading.`);
  }
  return id;
}

/**
 * The turn payload for the composer's attachments. With `useUploads`, images,
 * files, and document originals reference their finished pending upload (call
 * `settleComposerAttachmentUploads` first); without it images ride inline,
 * documents as text only, and files cannot send.
 */
export async function buildComposerTurnAttachments(input: {
  readonly environmentId: EnvironmentId;
  readonly attachments: ReadonlyArray<ComposerSendAttachment>;
  readonly useUploads: boolean;
  readonly fileUploadLimit: number | null;
}): Promise<TurnAttachmentInput[]> {
  const uploadedIds = new Set(
    input.useUploads
      ? uploadableComposerAttachments(input.attachments, input.fileUploadLimit).map(
          (attachment) => attachment.id,
        )
      : [],
  );
  return Promise.all(
    input.attachments.map(async (attachment): Promise<TurnAttachmentInput> => {
      if (attachment.type === "document") {
        return {
          type: "document",
          ...(uploadedIds.has(attachment.id)
            ? { id: requireUploadedId(input.environmentId, attachment) }
            : {}),
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
          extractedText: attachment.extractedText,
        };
      }
      if (attachment.type === "file") {
        if (!input.useUploads) {
          throw new Error(
            `'${attachment.name}' needs a connected server that accepts file uploads.`,
          );
        }
        return {
          type: "file",
          id: requireUploadedId(input.environmentId, attachment),
          name: attachment.name,
          mimeType: attachment.mimeType,
          sizeBytes: attachment.sizeBytes,
        };
      }
      if (input.useUploads) {
        return {
          type: "image",
          id: requireUploadedId(input.environmentId, attachment),
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
  attachments: ReadonlyArray<ComposerSendAttachment>,
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
    if (attachment.type === "file") {
      // Not downloadable until the server echoes the claimed copy.
      return {
        type: "file",
        id: attachment.id,
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        downloadable: false,
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

/**
 * Uploads bytes that are not in any composer draft (an attachment reloaded
 * from an earlier message) and returns the pending id for the next turn.
 */
async function uploadDetachedFile(input: {
  readonly environmentId: EnvironmentId;
  readonly file: File;
  readonly name: string;
  readonly mimeType: string;
}): Promise<string> {
  const attachment: ComposerFileAttachment = {
    type: "file",
    id: randomUUID(),
    name: input.name,
    mimeType: input.mimeType,
    sizeBytes: input.file.size,
    file: input.file,
  };
  startAttachmentUpload({ environmentId: input.environmentId, attachment });
  await awaitAttachmentUploads([attachment.id]);
  const id = readUploadedAttachmentId(input.environmentId, attachment.id);
  if (id === null) {
    releaseAttachmentUpload(attachment.id);
    throw new Error(`Could not upload '${input.name}' again.`);
  }
  // The turn claims the pending upload; the server sweeps it if never sent.
  forgetAttachmentUploads([attachment.id]);
  return id;
}

// Persisted ids carry the original's extension when the server kept the
// original bytes: `<thread>-<uuid>-pdf`.
const ATTACHMENT_ID_WITH_EXTENSION =
  /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9]{1,10}$/i;

/**
 * Rebuilds the turn payload for an attachment of an already sent message
 * (retry, fork edit) from its resolved asset URL. Avi Code addition.
 */
export async function reloadSentAttachment(
  attachment: ChatAttachment & { readonly previewUrl?: string },
  input: { readonly environmentId: EnvironmentId; readonly useUploads: boolean },
): Promise<TurnAttachmentInput> {
  if (!attachment.previewUrl) {
    throw new Error(`The original attachment '${attachment.name}' is unavailable.`);
  }
  const response = await fetch(attachment.previewUrl);
  if (!response.ok) {
    throw new Error(`Could not reload '${attachment.name}'.`);
  }
  if (isDocumentAttachment(attachment)) {
    if (!ATTACHMENT_ID_WITH_EXTENSION.test(attachment.id)) {
      // Legacy documents serve their extracted text.
      return {
        type: "document",
        name: attachment.name,
        mimeType: attachment.mimeType,
        sizeBytes: attachment.sizeBytes,
        extractedText: await response.text(),
      };
    }
    // The asset is the original: extract its text again, and send the
    // original along when the server takes uploads.
    const original = new File([await response.blob()], attachment.name, {
      type: attachment.mimeType,
    });
    const extracted = await extractDocument(original);
    return {
      type: "document",
      ...(input.useUploads
        ? {
            id: await uploadDetachedFile({
              environmentId: input.environmentId,
              file: original,
              name: attachment.name,
              mimeType: attachment.mimeType,
            }),
          }
        : {}),
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: attachment.sizeBytes,
      extractedText: extracted.text,
    };
  }
  if (isFileAttachment(attachment)) {
    if (!input.useUploads) {
      throw new Error(`'${attachment.name}' needs a connected server that accepts file uploads.`);
    }
    const file = new File([await response.blob()], attachment.name, {
      type: attachment.mimeType,
    });
    return {
      type: "file",
      id: await uploadDetachedFile({
        environmentId: input.environmentId,
        file,
        name: attachment.name,
        mimeType: attachment.mimeType,
      }),
      name: attachment.name,
      mimeType: attachment.mimeType,
      sizeBytes: file.size,
    };
  }
  if (!isImageAttachment(attachment)) {
    throw new Error(`'${attachment.name}' cannot be sent again.`);
  }
  const blob = await response.blob();
  return {
    type: "image",
    name: attachment.name,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    dataUrl: await readFileAsDataUrl(
      new File([blob], attachment.name, { type: attachment.mimeType }),
    ),
  };
}
