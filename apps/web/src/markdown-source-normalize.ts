/**
 * Avi Code addition: CommonMark refuses to let an ordered-list item interrupt a
 * paragraph unless its start number is 1. So a numbered list that continues
 * after a bold lead-in (`**Heading**` then `6.` `7.` `8.`) collapses into
 * paragraph text instead of rendering as a list. This normalizes the source by
 * inserting a blank line before an ordered-item line (numbered other than 1)
 * that directly follows a paragraph line, so the continuation parses as its own
 * `<ol start=...>`. Fenced code is left untouched.
 *
 * Inserting newlines shifts byte offsets, so `mapOffset` translates an offset in
 * the normalized text back to the original source. It is used to write task-list
 * checkbox toggles back to the stored message at the correct byte.
 */

// CommonMark ordered marker: up to 3 leading spaces, 1-9 digits, `.` or `)`,
// then whitespace and some content. Captures the start number.
const ORDERED_ITEM_LINE = /^\s{0,3}(\d{1,9})[.)]\s+\S/u;
const LIST_ITEM_LINE = /^\s{0,3}(?:\d{1,9}[.)]|[-*+])\s+/u;
const ATX_HEADING_LINE = /^\s{0,3}#{1,6}(?:\s|$)/u;
const FENCE_LINE = /^\s{0,3}(?:```|~~~)/u;

export interface NormalizedMarkdown {
  readonly text: string;
  readonly mapOffset: (offset: number) => number;
}

/**
 * A previous line that a numbered continuation would otherwise glue onto: real
 * paragraph text. Blank lines, list items, ATX headings, and fences already
 * terminate the preceding block, so an ordered item after them starts a list on
 * its own and needs no help.
 */
function isParagraphLine(line: string): boolean {
  if (line.trim().length === 0) return false;
  if (LIST_ITEM_LINE.test(line)) return false;
  if (ATX_HEADING_LINE.test(line)) return false;
  if (FENCE_LINE.test(line)) return false;
  return true;
}

export function normalizeOrderedListContinuations(text: string): NormalizedMarkdown {
  const lines = text.split("\n");
  const out: string[] = [];
  const insertionOffsets: number[] = [];
  let normalizedLen = 0;
  let emitted = false;
  let inFence = false;

  const emit = (line: string, synthetic: boolean) => {
    if (emitted) {
      // Separator newline before this line. When the line is a synthetic blank,
      // that separator is the extra character the mapping must account for.
      if (synthetic) insertionOffsets.push(normalizedLen);
      normalizedLen += 1;
    }
    emitted = true;
    normalizedLen += line.length;
    out.push(line);
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";

    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
      emit(line, false);
      continue;
    }

    if (!inFence && index > 0) {
      const orderedMatch = ORDERED_ITEM_LINE.exec(line);
      // A start number of 1 already interrupts a paragraph, so only 2+ break.
      if (
        orderedMatch &&
        Number(orderedMatch[1]) !== 1 &&
        isParagraphLine(lines[index - 1] ?? "")
      ) {
        emit("", true);
      }
    }

    emit(line, false);
  }

  if (insertionOffsets.length === 0) {
    return { text, mapOffset: (offset) => offset };
  }

  return {
    text: out.join("\n"),
    mapOffset: (offset: number): number => {
      let shifted = offset;
      for (const insertionOffset of insertionOffsets) {
        if (insertionOffset < offset) shifted -= 1;
        else break;
      }
      return shifted;
    },
  };
}
