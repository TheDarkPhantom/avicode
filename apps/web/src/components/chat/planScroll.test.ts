import { describe, expect, it } from "vite-plus/test";

import {
  PLAN_TOP_VIEW_OFFSET_PX,
  resolvePlanScrollOffset,
  shouldApplyPlanScroll,
} from "./planScroll";

describe("resolvePlanScrollOffset", () => {
  it("moves a plan sitting below the fold up to the top of the viewport", () => {
    // The reported case: the card starts 600px down the viewport, so expanding
    // it leaves the reader looking at the middle of the plan.
    expect(resolvePlanScrollOffset({ currentScroll: 1_000, planTop: 700, viewportTop: 100 })).toBe(
      1_600 - PLAN_TOP_VIEW_OFFSET_PX,
    );
  });

  it("scrolls back up for a plan whose top is above the viewport", () => {
    // Expanding grows the card downwards, so a plan that began just on screen
    // can end up with its first line scrolled off the top.
    expect(resolvePlanScrollOffset({ currentScroll: 1_000, planTop: 40, viewportTop: 100 })).toBe(
      940 - PLAN_TOP_VIEW_OFFSET_PX,
    );
  });

  it("leaves a plan already at the top essentially where it is", () => {
    const offset = resolvePlanScrollOffset({
      currentScroll: 500,
      planTop: 100 + PLAN_TOP_VIEW_OFFSET_PX,
      viewportTop: 100,
    });
    expect(offset).toBe(500);
  });

  it("never asks the list for a negative offset", () => {
    // The first plan in a short thread sits above the scrollable range, and a
    // negative offset makes the list bounce.
    expect(resolvePlanScrollOffset({ currentScroll: 10, planTop: 0, viewportTop: 500 })).toBe(0);
  });

  it("honours a caller-supplied offset", () => {
    expect(
      resolvePlanScrollOffset({
        currentScroll: 1_000,
        planTop: 700,
        viewportTop: 100,
        viewOffsetPx: 0,
      }),
    ).toBe(1_600);
  });
});

describe("shouldApplyPlanScroll", () => {
  it("skips a move of under a pixel", () => {
    // Invisible, but it would still cancel momentum and register as a scroll.
    expect(shouldApplyPlanScroll({ currentScroll: 500, nextOffset: 500.4 })).toBe(false);
    expect(shouldApplyPlanScroll({ currentScroll: 500, nextOffset: 500 })).toBe(false);
  });

  it("applies a real move in either direction", () => {
    expect(shouldApplyPlanScroll({ currentScroll: 500, nextOffset: 620 })).toBe(true);
    expect(shouldApplyPlanScroll({ currentScroll: 500, nextOffset: 380 })).toBe(true);
  });
});
