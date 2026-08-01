/**
 * Avi Code addition: putting the top of a plan on screen when it is expanded.
 *
 * A collapsed plan card is capped in height. Expanding it grows the card
 * downwards from a button that sits at its bottom edge, so the viewport ends up
 * showing the middle or the end of the plan and the reader has to scroll back
 * up to reach the first line. The fix is to move the card's top to the top of
 * the scroll viewport in the same frame the expansion lands.
 *
 * The arithmetic lives here, away from the virtualized list, so the offset rule
 * can be tested without a layout engine.
 */

/**
 * Breathing room above the plan once it is scrolled into place, so the card's
 * top border is not flush against the edge of the viewport.
 */
export const PLAN_TOP_VIEW_OFFSET_PX = 12;

/**
 * The scroll offset that puts `planTop` at the top of the viewport.
 *
 * Expressed as an absolute offset rather than a delta because the virtualized
 * list is driven by absolute offsets. Clamped at zero: the first plan in a
 * short thread can sit above the scrollable area, and asking for a negative
 * offset makes the list bounce.
 */
export function resolvePlanScrollOffset(input: {
  /** The list's current scroll offset. */
  readonly currentScroll: number;
  /** Viewport-relative top of the plan card. */
  readonly planTop: number;
  /** Viewport-relative top of the scroll container. */
  readonly viewportTop: number;
  readonly viewOffsetPx?: number;
}): number {
  const viewOffset = input.viewOffsetPx ?? PLAN_TOP_VIEW_OFFSET_PX;
  const delta = input.planTop - input.viewportTop - viewOffset;
  return Math.max(0, input.currentScroll + delta);
}

/**
 * Whether moving to `nextOffset` is worth doing at all.
 *
 * A plan already sitting at the top of the viewport should not be nudged by a
 * fraction of a pixel: the scroll would be invisible but would still cancel any
 * momentum the user has and count as a scroll event elsewhere.
 */
export function shouldApplyPlanScroll(input: {
  readonly currentScroll: number;
  readonly nextOffset: number;
}): boolean {
  return Math.abs(input.nextOffset - input.currentScroll) >= 1;
}

/**
 * Nearest scrollable ancestor of `element`, or null.
 *
 * Found by walking up rather than by selector so this does not depend on the
 * virtualized list's internal markup, which is a third-party component's
 * business and free to change.
 */
export function findScrollContainer(element: HTMLElement | null): HTMLElement | null {
  let candidate = element?.parentElement ?? null;
  while (candidate) {
    const style = window.getComputedStyle(candidate);
    const scrollable = /auto|scroll|overlay/.test(style.overflowY);
    if (scrollable && candidate.scrollHeight > candidate.clientHeight) {
      return candidate;
    }
    candidate = candidate.parentElement;
  }
  return null;
}
