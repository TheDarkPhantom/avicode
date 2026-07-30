/**
 * Avi Code addition: pinned-first ordering for sidebar rows.
 *
 * Upstream orders projects and threads by activity, so rows reshuffle whenever
 * an agent does anything. Pinning partitions a list into "pinned, in the order
 * they were pinned" followed by "everything else, untouched" — the pinned block
 * therefore holds a stable position while the rest keeps upstream's behaviour.
 *
 * This lives in its own module rather than in `Sidebar.logic.ts` because both
 * sidebars use it, and because the shared sorters it wraps (`sortThreads`,
 * `sortProjectsByActivity`, `sortThreadsForSidebarV2`) must stay pin-agnostic:
 * the command palette, the after-delete fallback, and "latest thread for
 * project" all want plain chronological order.
 *
 * Items carry a *list* of keys because a grouped sidebar project row stands in
 * for several physical projects; pinning any member pins the row.
 */

export function isPinnedByKeys(
  pinnedKeys: readonly string[],
  itemKeys: readonly string[],
): boolean {
  return itemKeys.some((key) => pinnedKeys.includes(key));
}

export interface OrderPinnedFirstInput<T> {
  readonly items: readonly T[];
  readonly pinnedKeys: readonly string[];
  readonly getItemKeys: (item: T) => readonly string[];
}

export interface OrderPinnedFirstResult<T> {
  readonly ordered: T[];
  /** How many leading entries of `ordered` are pinned. Drives the v1 preview
      cap, which must not truncate a pinned row out of view. */
  readonly pinnedCount: number;
}

export function orderPinnedFirst<T>(input: OrderPinnedFirstInput<T>): OrderPinnedFirstResult<T> {
  if (input.pinnedKeys.length === 0 || input.items.length === 0) {
    return { ordered: [...input.items], pinnedCount: 0 };
  }

  const pinIndexByKey = new Map<string, number>();
  for (const [index, key] of input.pinnedKeys.entries()) {
    if (!pinIndexByKey.has(key)) {
      pinIndexByKey.set(key, index);
    }
  }

  // A row matching several pin keys sorts by its earliest one, so pinning a
  // second member of an already-pinned group never moves the row.
  const pinned: Array<{ readonly item: T; readonly pinIndex: number }> = [];
  const rest: T[] = [];
  for (const item of input.items) {
    let pinIndex = Number.POSITIVE_INFINITY;
    for (const key of input.getItemKeys(item)) {
      const candidate = pinIndexByKey.get(key);
      if (candidate !== undefined && candidate < pinIndex) {
        pinIndex = candidate;
      }
    }
    if (pinIndex === Number.POSITIVE_INFINITY) {
      rest.push(item);
    } else {
      pinned.push({ item, pinIndex });
    }
  }

  if (pinned.length === 0) {
    return { ordered: rest, pinnedCount: 0 };
  }

  // Stale keys — a pinned thread that was deleted elsewhere — simply match
  // nothing here, so they cost an unused map entry and nothing else.
  pinned.sort((left, right) => left.pinIndex - right.pinIndex);
  return {
    ordered: [...pinned.map((entry) => entry.item), ...rest],
    pinnedCount: pinned.length,
  };
}
