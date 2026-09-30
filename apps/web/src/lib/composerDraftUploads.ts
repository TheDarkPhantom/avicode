import type { ScopedThreadRef } from "@t3tools/contracts";

import { type DraftId, useComposerDraftStore } from "../composerDraftStore";
import { releaseDraftAttachments } from "./attachmentUploadQueue";

/**
 * Deletes the pending uploads a discarded draft still holds, including a
 * hydrated file's persisted upload. Call before the draft is cleared:
 * afterwards there is nothing left to read the ids from.
 */
export function releaseComposerDraftUploads(target: ScopedThreadRef | DraftId): void {
  const draft = useComposerDraftStore.getState().getComposerDraft(target);
  if (draft) {
    releaseDraftAttachments([...draft.images, ...draft.files]);
  }
}
