import { describe, expect, it, vi } from "vite-plus/test";

import {
  composerSelectionMatches,
  createPendingAnswerFocusSync,
  type ComposerSelectionSnapshot,
} from "./pendingAnswerFocusSync";

/**
 * Stands in for the controlled answer editor. `value` is what Lexical currently
 * holds, which lags a programmatic write until the controlled render lands --
 * `settle()` is that render.
 */
function createFakeEditor(initial: ComposerSelectionSnapshot) {
  let snapshot = initial;
  const frames: Array<() => void> = [];
  const focusAt = vi.fn((cursor: number) => {
    snapshot = { ...snapshot, cursor, expandedCursor: cursor };
  });

  return {
    focusAt,
    get snapshot() {
      return snapshot;
    },
    settle(next: ComposerSelectionSnapshot) {
      snapshot = next;
    },
    runFrames() {
      const pending = frames.splice(0, frames.length);
      for (const frame of pending) frame();
    },
    get pendingFrameCount() {
      return frames.length;
    },
    deps: {
      readSnapshot: () => snapshot,
      focusAt,
      scheduleFrame: (callback: () => void) => frames.push(callback),
      cancelFrame: (handle: number) => {
        frames.splice(handle - 1, 1);
      },
    },
  };
}

const empty: ComposerSelectionSnapshot = { value: "", cursor: 0, expandedCursor: 0 };

describe("composerSelectionMatches", () => {
  it("treats a missing snapshot as a mismatch", () => {
    expect(composerSelectionMatches(null, empty)).toBe(false);
    expect(composerSelectionMatches(undefined, empty)).toBe(false);
  });

  it("requires value and both cursors to agree", () => {
    const target = { value: "hello", cursor: 5, expandedCursor: 5 };
    expect(composerSelectionMatches({ value: "hello", cursor: 5, expandedCursor: 5 }, target)).toBe(
      true,
    );
    expect(composerSelectionMatches({ value: "hell", cursor: 5, expandedCursor: 5 }, target)).toBe(
      false,
    );
    expect(composerSelectionMatches({ value: "hello", cursor: 4, expandedCursor: 5 }, target)).toBe(
      false,
    );
  });
});

describe("createPendingAnswerFocusSync", () => {
  it("does not focus a lagging editor, which is what used to wipe a dictated answer", () => {
    // The editor still holds "" because React has not re-rendered yet. Focusing
    // here echoes that "" back through onChange and overwrites the transcript.
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "hello", cursor: 5, expandedCursor: 5 });

    expect(editor.focusAt).not.toHaveBeenCalled();
    expect(editor.pendingFrameCount).toBe(1);
  });

  it("focuses once the editor has caught up with the dictated text", () => {
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "hello", cursor: 5, expandedCursor: 5 });
    editor.settle({ value: "hello", cursor: 0, expandedCursor: 0 });
    editor.runFrames();

    expect(editor.focusAt).toHaveBeenCalledWith(5);
    expect(editor.snapshot.value).toBe("hello");
  });

  it("still refuses to focus when the editor never catches up", () => {
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "hello", cursor: 5, expandedCursor: 5 });
    editor.runFrames();

    expect(editor.focusAt).not.toHaveBeenCalled();
    expect(editor.snapshot.value).toBe("");
  });

  it("inserts an @ mention while a question is pending without losing it", () => {
    // Same path as dictation: the mention is written programmatically, so the
    // editor lags by one render.
    const mention = "@packages/contracts/src/preview.ts ";
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: mention, cursor: mention.length, expandedCursor: mention.length });
    expect(editor.focusAt).not.toHaveBeenCalled();

    editor.settle({ value: mention, cursor: 0, expandedCursor: 0 });
    editor.runFrames();

    expect(editor.focusAt).toHaveBeenCalledWith(mention.length);
    expect(editor.snapshot.value).toBe(mention);
  });

  it("schedules nothing when the editor already agrees, which is the typing path", () => {
    const editor = createFakeEditor({ value: "typed", cursor: 5, expandedCursor: 5 });
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "typed", cursor: 5, expandedCursor: 5 });

    expect(editor.pendingFrameCount).toBe(0);
    expect(editor.focusAt).not.toHaveBeenCalled();
  });

  it("keeps only the newest write when transcripts arrive faster than frames", () => {
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "hel", cursor: 3, expandedCursor: 3 });
    sync.sync({ value: "hello", cursor: 5, expandedCursor: 5 });
    expect(editor.pendingFrameCount).toBe(1);

    editor.settle({ value: "hello", cursor: 0, expandedCursor: 0 });
    editor.runFrames();

    expect(editor.focusAt).toHaveBeenCalledTimes(1);
    expect(editor.focusAt).toHaveBeenCalledWith(5);
  });

  it("drops a deferred focus when the user leaves the thread", () => {
    const editor = createFakeEditor(empty);
    const sync = createPendingAnswerFocusSync(editor.deps);

    sync.sync({ value: "hello", cursor: 5, expandedCursor: 5 });
    sync.cancel();
    editor.settle({ value: "hello", cursor: 0, expandedCursor: 0 });
    editor.runFrames();

    expect(editor.focusAt).not.toHaveBeenCalled();
  });
});
