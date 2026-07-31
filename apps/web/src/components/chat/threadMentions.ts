import { THREAD_CONTEXT_MAX_REFERENCES, type ThreadId } from "@t3tools/contracts";

/**
 * Avi Code addition: thread references are picked from the composer's `@` menu
 * rather than a dedicated footer button. These helpers keep the filtering and
 * the reference cap out of `ChatComposer` so both are testable on their own.
 */

export type ThreadMentionCandidate = {
  threadId: ThreadId;
  title: string;
  projectTitle: string;
  archived: boolean;
};

/**
 * How many thread suggestions the `@` menu offers at once. Deliberately small:
 * files are the overwhelmingly common reason to type `@`, and threads sit below
 * them, so a long thread list would push the file results off screen.
 */
export const THREAD_MENTION_SUGGESTION_LIMIT = 5;

/** Whether another thread can be attached, per the contract's hard cap. */
export function canReferenceMoreThreads(referencedCount: number): boolean {
  return referencedCount < THREAD_CONTEXT_MAX_REFERENCES;
}

export function threadReferenceLimitMessage(): string {
  return `You can reference up to ${THREAD_CONTEXT_MAX_REFERENCES} threads.`;
}

/**
 * Thread suggestions for an `@` query. Returns nothing once the reference cap is
 * reached, so the menu stops offering threads it would only reject on select.
 */
export function filterThreadMentionCandidates<T extends ThreadMentionCandidate>(
  candidates: ReadonlyArray<T>,
  input: {
    query: string;
    referencedThreadIds: ReadonlyArray<ThreadId>;
    limit?: number;
  },
): Array<T> {
  if (!canReferenceMoreThreads(input.referencedThreadIds.length)) {
    return [];
  }

  const query = input.query.trim().toLocaleLowerCase();
  return candidates
    .filter((candidate) => !input.referencedThreadIds.includes(candidate.threadId))
    .filter(
      (candidate) =>
        query.length === 0 ||
        candidate.title.toLocaleLowerCase().includes(query) ||
        candidate.projectTitle.toLocaleLowerCase().includes(query),
    )
    .slice(0, input.limit ?? THREAD_MENTION_SUGGESTION_LIMIT);
}

/** The secondary line under a thread suggestion. */
export function threadMentionDescription(candidate: ThreadMentionCandidate): string {
  return candidate.archived ? `${candidate.projectTitle} · Archived` : candidate.projectTitle;
}
