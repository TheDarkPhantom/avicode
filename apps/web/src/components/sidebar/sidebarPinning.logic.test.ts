import { describe, expect, it } from "vite-plus/test";

import { isPinnedByKeys, orderPinnedFirst } from "./sidebarPinning.logic";

interface Row {
  readonly id: string;
  readonly keys: readonly string[];
}

const row = (id: string, ...keys: string[]): Row => ({ id, keys: keys.length > 0 ? keys : [id] });

const order = (items: readonly Row[], pinnedKeys: readonly string[]) =>
  orderPinnedFirst({ items, pinnedKeys, getItemKeys: (item) => item.keys });

const ids = (items: readonly Row[]) => items.map((item) => item.id);

describe("isPinnedByKeys", () => {
  it("matches when any of the item's keys is pinned", () => {
    expect(isPinnedByKeys(["b"], ["a", "b"])).toBe(true);
    expect(isPinnedByKeys(["c"], ["a", "b"])).toBe(false);
    expect(isPinnedByKeys([], ["a"])).toBe(false);
    expect(isPinnedByKeys(["a"], [])).toBe(false);
  });
});

describe("orderPinnedFirst", () => {
  it("moves pinned items to the front in pin order, not list order", () => {
    const items = [row("a"), row("b"), row("c"), row("d")];
    // Pinned "c" before "a" — the pin array is the display order.
    const result = order(items, ["c", "a"]);
    expect(ids(result.ordered)).toEqual(["c", "a", "b", "d"]);
    expect(result.pinnedCount).toBe(2);
  });

  it("keeps unpinned items in their incoming order", () => {
    const items = [row("a"), row("b"), row("c"), row("d")];
    expect(ids(order(items, ["b"]).ordered)).toEqual(["b", "a", "c", "d"]);
  });

  it("preserves order and reports no pins when nothing is pinned", () => {
    const items = [row("a"), row("b")];
    const result = order(items, []);
    expect(ids(result.ordered)).toEqual(["a", "b"]);
    expect(result.pinnedCount).toBe(0);
  });

  it("returns a copy rather than the original array", () => {
    const items = [row("a"), row("b")];
    expect(order(items, []).ordered).not.toBe(items);
  });

  it("ignores stale pin keys that match no item", () => {
    const items = [row("a"), row("b")];
    const result = order(items, ["deleted-thread", "b"]);
    expect(ids(result.ordered)).toEqual(["b", "a"]);
    expect(result.pinnedCount).toBe(1);
  });

  it("handles an empty item list", () => {
    const result = order([], ["a"]);
    expect(result.ordered).toEqual([]);
    expect(result.pinnedCount).toBe(0);
  });

  it("pins a grouped row when any member key is pinned", () => {
    const items = [row("group", "member-1", "member-2"), row("solo")];
    const result = order(items, ["member-2"]);
    expect(ids(result.ordered)).toEqual(["group", "solo"]);
    expect(result.pinnedCount).toBe(1);
  });

  it("counts a multi-key row once and sorts it by its earliest pin", () => {
    const items = [row("group", "member-1", "member-2"), row("other")];
    // "other" was pinned between the two group members: the group still wins
    // because it matches pin index 0.
    const result = order(items, ["member-1", "other", "member-2"]);
    expect(ids(result.ordered)).toEqual(["group", "other"]);
    expect(result.pinnedCount).toBe(2);
  });

  it("does not move an existing pin when a later one is added", () => {
    const items = [row("a"), row("b"), row("c")];
    const before = ids(order(items, ["c"]).ordered);
    const after = ids(order(items, ["c", "a"]).ordered);
    expect(before).toEqual(["c", "a", "b"]);
    expect(after).toEqual(["c", "a", "b"]);
    // "c" holds index 0 across both — that is the "does not switch around"
    // guarantee the feature exists for.
    expect(after[0]).toBe(before[0]);
  });
});
