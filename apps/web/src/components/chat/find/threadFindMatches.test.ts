import { describe, expect, it } from "vite-plus/test";

import {
  findThreadMatches,
  formatMatchCount,
  reconcileMatchIndex,
  stepMatchIndex,
  type ThreadFindSource,
} from "./threadFindMatches";

const sources: ThreadFindSource[] = [
  { rowIndex: 0, rowId: "m1", text: "Please check the migration numbering" },
  { rowIndex: 4, rowId: "w7", entryId: "entry-7", text: "git commit -m 'fix migration'" },
  { rowIndex: 9, rowId: "m2", text: "Migration 038 was renumbered. Migration ids are hand made." },
];

describe("findThreadMatches", () => {
  it("finds matches across messages and tool calls, in display order", () => {
    expect(findThreadMatches(sources, "migration")).toEqual([
      { rowIndex: 0, rowId: "m1", entryId: undefined, offset: 17, length: 9 },
      { rowIndex: 4, rowId: "w7", entryId: "entry-7", offset: 19, length: 9 },
      { rowIndex: 9, rowId: "m2", entryId: undefined, offset: 0, length: 9 },
      { rowIndex: 9, rowId: "m2", entryId: undefined, offset: 30, length: 9 },
    ]);
  });

  it("ignores case", () => {
    expect(findThreadMatches(sources, "MIGRATION")).toHaveLength(4);
  });

  it("carries the entry id so a collapsed tool body can be expanded", () => {
    const [match] = findThreadMatches([sources[1] as ThreadFindSource], "commit");
    expect(match).toMatchObject({ rowId: "w7", entryId: "entry-7" });
  });

  it("does not overlap repeated matches", () => {
    expect(findThreadMatches([{ rowIndex: 0, rowId: "a", text: "aaaa" }], "aa")).toEqual([
      { rowIndex: 0, rowId: "a", entryId: undefined, offset: 0, length: 2 },
      { rowIndex: 0, rowId: "a", entryId: undefined, offset: 2, length: 2 },
    ]);
  });

  it("returns nothing for an empty or whitespace query", () => {
    expect(findThreadMatches(sources, "")).toEqual([]);
    expect(findThreadMatches(sources, "   ")).toEqual([]);
  });

  it("treats the query as literal text, not a pattern", () => {
    const literal: ThreadFindSource[] = [{ rowIndex: 0, rowId: "a", text: "call foo(bar) twice" }];
    expect(findThreadMatches(literal, "foo(bar)")).toHaveLength(1);
    // A bare bracket would be a syntax error if this compiled a regex.
    expect(findThreadMatches(literal, "(")).toHaveLength(1);
    expect(findThreadMatches(literal, ".*")).toHaveLength(0);
  });
});

describe("stepMatchIndex", () => {
  it("wraps at both ends so repeated presses cycle", () => {
    expect(stepMatchIndex(2, 3, "next")).toBe(0);
    expect(stepMatchIndex(0, 3, "previous")).toBe(2);
  });

  it("starts at the first match going forward and the last going back", () => {
    expect(stepMatchIndex(-1, 3, "next")).toBe(0);
    expect(stepMatchIndex(-1, 3, "previous")).toBe(2);
  });

  it("reports nothing to step through when there are no matches", () => {
    expect(stepMatchIndex(0, 0, "next")).toBe(-1);
  });
});

describe("reconcileMatchIndex", () => {
  it("holds position on the same row while the query grows", () => {
    const matches = findThreadMatches(sources, "migration");
    // The user was on the tool-call match; a re-search must not throw them back
    // to the top of the thread.
    const previous = matches[1] ?? null;
    expect(reconcileMatchIndex(previous, matches)).toBe(1);
  });

  it("falls back to the first match when the previous row no longer matches", () => {
    const matches = findThreadMatches(sources, "migration");
    expect(
      reconcileMatchIndex({ rowIndex: 99, rowId: "gone", offset: 0, length: 3 }, matches),
    ).toBe(0);
  });

  it("reports nothing when the query stops matching entirely", () => {
    expect(reconcileMatchIndex(null, [])).toBe(-1);
  });
});

describe("formatMatchCount", () => {
  it("counts from one for the reader", () => {
    expect(formatMatchCount(2, 41, "migration")).toBe("3 of 41");
  });

  it("says so when a real query finds nothing", () => {
    expect(formatMatchCount(-1, 0, "migration")).toBe("No results");
  });

  it("stays quiet before anything is typed", () => {
    expect(formatMatchCount(-1, 0, "")).toBe("");
  });
});
