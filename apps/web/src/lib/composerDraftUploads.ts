import type { ScopedThreadRef } from "@t3tools/contracts";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { releaseAttachmentUploads } from "./attachmentUploadQueue";

/**
 * Deletes the pending uploads a discarded draft still holds. Call before the
 * draft is cleared: afterwards there is nothing left to read the ids from.
 */
export function releaseComposerDraftUploads(target: ScopedThreadRef | DraftId): void {
  const draft = useComposerDraftStore.getState().getComposerDraft(target);
  if (draft) {
    releaseAttachmentUploads(draft.images.map((attachment) => attachment.id));
  }
}
