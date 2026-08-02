/**
 * Avi Code addition: find within the open thread.
 *
 * The transcript is virtualized and several containers are collapsed, so the
 * browser's own find (and Electron's `findInPage`) can only see the handful of
 * rows currently mounted. On a long thread that means confidently reporting
 * "1 of 2" when there are forty matches. This searches the messages the client
 * already holds in memory instead, so the count is the truth and a match can be
 * revealed even when its row has never been rendered.
 */

/** One searchable piece of the transcript, in display order. */
export interface ThreadFindSource {
  readonly rowIndex: number;
  readonly rowId: string;
  /** Set for a tool call, so revealing a match can expand the right entry. */
  readonly entryId?: string | undefined;
  readonly text: string;
}

export interface ThreadFindMatch {
  readonly rowIndex: number;
  readonly rowId: string;
  readonly entryId?: string | undefined;
  /** Offset of the match within that source's text. */
  readonly offset: number;
  readonly length: number;
}

/**
 * Case-insensitive substring search, in display order, non-overlapping.
 *
 * Deliberately not a regex: the query is whatever the user typed, and a stray
 * `(` should find a bracket rather than throw or match nothing.
 */
export function findThreadMatches(
  sources: readonly ThreadFindSource[],
  query: string,
): ThreadFindMatch[] {
  const needle = query.trim().toLowerCase();
  if (needle.length === 0) return [];

  const matches: ThreadFindMatch[] = [];
  for (const source of sources) {
    const haystack = source.text.toLowerCase();
    let offset = haystack.indexOf(needle);
    while (offset !== -1) {
      matches.push({
        rowIndex: source.rowIndex,
        rowId: source.rowId,
        entryId: source.entryId,
        offset,
        length: needle.length,
      });
      offset = haystack.indexOf(needle, offset + needle.length);
    }
  }
  return matches;
}

/**
 * Step through matches, wrapping at both ends so repeated presses cycle rather
 * than dead-ending. Returns -1 when there is nothing to step through.
 */
export function stepMatchIndex(
  current: number,
  total: number,
  direction: "next" | "previous",
): number {
  if (total <= 0) return -1;
  if (current < 0) return direction === "next" ? 0 : total - 1;
  return direction === "next" ? (current + 1) % total : (current - 1 + total) % total;
}

/**
 * Keep the caret on the same match across a re-search where possible, so typing
 * another character does not throw the user back to the top of the thread.
 */
export function reconcileMatchIndex(
  previousMatch: ThreadFindMatch | null,
  matches: readonly ThreadFindMatch[],
): number {
  if (matches.length === 0) return -1;
  if (!previousMatch) return 0;
  const sameRow = matches.findIndex(
    (match) => match.rowId === previousMatch.rowId && match.offset >= previousMatch.offset,
  );
  if (sameRow !== -1) return sameRow;
  const anyInRow = matches.findIndex((match) => match.rowId === previousMatch.rowId);
  return anyInRow !== -1 ? anyInRow : 0;
}

/** "3 of 41", or "No results" when a non-empty query found nothing. */
export function formatMatchCount(matchIndex: number, total: number, query: string): string {
  if (query.trim().length === 0) return "";
  if (total === 0) return "No results";
  return `${matchIndex + 1} of ${total}`;
}
