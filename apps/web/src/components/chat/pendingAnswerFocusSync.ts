/**
 * Avi Code addition: keeps the pending-question answer editor's caret in step
 * with a value that was just written programmatically.
 *
 * The answer editor is controlled, so a programmatic write -- dictation, an `@`
 * mention, a slash command, a stash insertion -- reaches the change handler one
 * render before Lexical holds the new text. Focusing the editor inside that
 * window makes it echo its own stale value back through `onChange`, which lands
 * in the same handler and overwrites the write. Dictation looked live and
 * produced nothing.
 *
 * Waiting a frame lets the controlled update land first. The pre-frame check
 * keeps the typing path free (the editor already agrees, so there is nothing to
 * sync), and the in-frame value check refuses to focus an editor that still
 * lags, because that is precisely when the echo does damage.
 */

export interface ComposerSelectionSnapshot {
  readonly value: string;
  readonly cursor: number;
  readonly expandedCursor: number;
}

export type ComposerSelectionTarget = ComposerSelectionSnapshot;

export function composerSelectionMatches(
  snapshot: ComposerSelectionSnapshot | null | undefined,
  target: ComposerSelectionTarget,
): boolean {
  return (
    snapshot?.value === target.value &&
    snapshot.cursor === target.cursor &&
    snapshot.expandedCursor === target.expandedCursor
  );
}

export interface PendingAnswerFocusSyncDeps {
  readonly readSnapshot: () => ComposerSelectionSnapshot | null | undefined;
  readonly focusAt: (cursor: number) => void;
  readonly scheduleFrame: (callback: () => void) => number;
  readonly cancelFrame: (handle: number) => void;
}

export interface PendingAnswerFocusSync {
  /** Bring the editor caret to `target`, deferring while the editor lags. */
  readonly sync: (target: ComposerSelectionTarget) => void;
  /** Drop a deferred sync, for unmount or when the user leaves the thread. */
  readonly cancel: () => void;
}

export function createPendingAnswerFocusSync(
  deps: PendingAnswerFocusSyncDeps,
): PendingAnswerFocusSync {
  let frame: number | null = null;

  const cancel = () => {
    if (frame === null) return;
    deps.cancelFrame(frame);
    frame = null;
  };

  const sync = (target: ComposerSelectionTarget) => {
    cancel();
    // The editor already agrees, which is what typing looks like. Touching it
    // would only risk an echo for no gain.
    if (composerSelectionMatches(deps.readSnapshot(), target)) return;

    frame = deps.scheduleFrame(() => {
      frame = null;
      const settled = deps.readSnapshot();
      // Still lagging: focusing now would echo the stale text back and undo the
      // write. Leave it be and let the next controlled render settle it.
      if (settled?.value !== target.value) return;
      deps.focusAt(target.cursor);
    });
  };

  return { sync, cancel };
}
