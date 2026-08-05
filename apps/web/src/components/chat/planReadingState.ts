export interface PlanReadingAnchor {
  rowId: string;
  offsetWithinRow: number;
}

export interface TimelineRowMeasurement {
  rowId: string;
  top: number;
  height: number;
}

export function capturePlanReadingAnchor(
  scrollOffset: number,
  rows: readonly TimelineRowMeasurement[],
): PlanReadingAnchor | null {
  if (!Number.isFinite(scrollOffset) || scrollOffset < 0) return null;
  for (const row of rows) {
    if (
      !row.rowId ||
      !Number.isFinite(row.top) ||
      !Number.isFinite(row.height) ||
      row.height <= 0
    ) {
      continue;
    }
    if (row.top + row.height > scrollOffset) {
      return {
        rowId: row.rowId,
        // Negative is valid when LegendList bottom-aligns short content and the
        // first row starts below the viewport's top edge.
        offsetWithinRow: scrollOffset - row.top,
      };
    }
  }
  return null;
}

export function resolvePlanReadingScrollOffset(input: {
  anchor: PlanReadingAnchor;
  currentScroll: number;
  rowViewportTop: number;
  viewportTop: number;
}): number | null {
  if (
    !Number.isFinite(input.currentScroll) ||
    !Number.isFinite(input.rowViewportTop) ||
    !Number.isFinite(input.viewportTop) ||
    !Number.isFinite(input.anchor.offsetWithinRow)
  ) {
    return null;
  }
  return Math.max(
    0,
    input.currentScroll + input.rowViewportTop - input.viewportTop + input.anchor.offsetWithinRow,
  );
}
