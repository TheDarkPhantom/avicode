/**
 * Avi Code addition: knowing a project holds composer text you never sent.
 *
 * A draft session only becomes a thread on the first send, so until then it is
 * invisible everywhere — the sidebar lists threads, and an unsent draft is not
 * one. The only way to discover it was to click the project and find your own
 * words already in the composer. This module supplies the predicate the sidebar
 * project rows use to show a marker instead.
 */

import {
  type ComposerThreadDraftState,
  type DraftThreadState,
  useComposerDraftStore,
} from "./composerDraftStore";

/**
 * The slices of the draft store this predicate reads. Narrowed so the pure
 * function can be exercised with plain objects.
 */
export interface UnsentDraftLookupState {
  readonly draftsByThreadKey: Record<string, ComposerThreadDraftState>;
  readonly draftThreadsByThreadKey: Record<string, DraftThreadState>;
  readonly logicalProjectDraftThreadKeyByLogicalProjectKey: Record<string, string>;
}

/**
 * Whether this composer content is worth telling the user about.
 *
 * Deliberately narrower than the store's own "is this draft worth keeping"
 * test. Model, runtime mode and interaction mode all persist into a draft the
 * moment a project row is clicked, so treating those as content would put a
 * marker on every project the user has ever opened a composer for. Only things
 * the user typed or attached count.
 *
 * Terminal, element, preview and review contexts count because each is an
 * explicit pick that would be lost with the draft, not a default carried in.
 */
export function hasUnsentComposerContent(
  draft: ComposerThreadDraftState | null | undefined,
): boolean {
  if (!draft) return false;
  return (
    draft.prompt.trim().length > 0 ||
    draft.images.length > 0 ||
    draft.persistedAttachments.length > 0 ||
    draft.terminalContexts.length > 0 ||
    draft.threadContextIds.length > 0 ||
    draft.elementContexts.length > 0 ||
    draft.previewAnnotations.length > 0 ||
    draft.reviewComments.length > 0
  );
}

/**
 * Whether the project keyed by `logicalProjectKey` holds an unsent draft.
 *
 * A draft mid-promotion is excluded: it is on its way to becoming a real
 * thread, which the sidebar is about to list on its own. Marking it would make
 * the row flicker between send and the thread arriving.
 */
export function selectProjectHasUnsentDraft(
  state: UnsentDraftLookupState,
  logicalProjectKey: string,
): boolean {
  const normalizedKey = logicalProjectKey.trim();
  if (normalizedKey.length === 0) return false;

  const draftId = state.logicalProjectDraftThreadKeyByLogicalProjectKey[normalizedKey];
  if (!draftId) return false;

  const draftSession = state.draftThreadsByThreadKey[draftId];
  if (!draftSession || draftSession.promotedTo != null) return false;

  return hasUnsentComposerContent(state.draftsByThreadKey[draftId]);
}

/**
 * Sidebar-facing hook. The selector collapses to a boolean, so a project row
 * only re-renders when the draft crosses between empty and non-empty — not on
 * every keystroke in the composer.
 */
export function useProjectHasUnsentDraft(logicalProjectKey: string): boolean {
  return useComposerDraftStore((state) => selectProjectHasUnsentDraft(state, logicalProjectKey));
}

/**
 * Whether the existing thread keyed by `threadKey` holds an unsent draft.
 *
 * Simpler than the project case: a real thread's draft is filed directly under
 * its scoped thread key (`environmentId:threadId`) in `draftsByThreadKey`, not
 * under a draft session, so there is no promotion handoff to exclude.
 */
export function selectThreadHasUnsentDraft(
  state: UnsentDraftLookupState,
  threadKey: string,
): boolean {
  const normalizedKey = threadKey.trim();
  if (normalizedKey.length === 0) return false;

  return hasUnsentComposerContent(state.draftsByThreadKey[normalizedKey]);
}

/**
 * Sidebar-facing hook for an existing thread row. Collapses to a boolean like
 * its project counterpart so a row only re-renders on the empty↔non-empty
 * transition, not on every keystroke.
 */
export function useThreadHasUnsentDraft(threadKey: string): boolean {
  return useComposerDraftStore((state) => selectThreadHasUnsentDraft(state, threadKey));
}
