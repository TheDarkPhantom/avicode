/**
 * Avi Code addition: pure geometry for the preview split-by-drag drop zone.
 *
 * A preview tab dragged past the horizontal midpoint of the panel body lands in
 * the right half, which is the gesture that splits it in beside the active
 * preview. Kept pure so it is testable without a DOM.
 */
export function isRightHalfDrop(
  clientX: number,
  rect: { readonly left: number; readonly width: number },
): boolean {
  return clientX >= rect.left + rect.width / 2;
}

/** Pointer travel (px) past which a tab press becomes a drag rather than a click. */
export const RIGHT_PANEL_DRAG_THRESHOLD = 5;

/** Whether pointer travel from the press origin has crossed the drag threshold. */
export function exceedsDragThreshold(dx: number, dy: number): boolean {
  return Math.hypot(dx, dy) >= RIGHT_PANEL_DRAG_THRESHOLD;
}
