import type { VcsStatusResult } from "@t3tools/contracts";
import type { AnimationEvent } from "react";
import { describe, expect, it } from "vite-plus/test";

import {
  prStatusIndicator,
  resolveThreadPr,
  settledPrHoverColorClass,
  synchronizeTerminalPulse,
} from "./ThreadStatusIndicators";

describe("synchronizeTerminalPulse", () => {
  it("pins only the status pulse to the document clock", () => {
    const pulse = { animationName: "status-pulse", startTime: 975 } as CSSAnimation;
    const otherCss = { animationName: "other-animation", startTime: 125 } as CSSAnimation;
    const otherAnimation = { startTime: 250 } as Animation;

    synchronizeTerminalPulse({
      animationName: "status-pulse",
      currentTarget: { getAnimations: () => [pulse, otherCss, otherAnimation] },
    } as unknown as AnimationEvent<SVGSVGElement>);

    expect([pulse.startTime, otherCss.startTime, otherAnimation.startTime]).toEqual([0, 125, 250]);
  });

  it("ignores other animations starting on the icon", () => {
    const pulse = { animationName: "status-pulse", startTime: 975 } as CSSAnimation;

    synchronizeTerminalPulse({
      animationName: "fade-in",
      currentTarget: { getAnimations: () => [pulse] },
    } as unknown as AnimationEvent<SVGSVGElement>);

    expect(pulse.startTime).toBe(975);
  });
});

function status(overrides: Partial<VcsStatusResult> = {}): VcsStatusResult {
  return {
    isRepo: true,
    hasPrimaryRemote: true,
    isDefaultRef: false,
    refName: "feature/current",
    hasWorkingTreeChanges: false,
    workingTree: { files: [], insertions: 0, deletions: 0 },
    hasUpstream: true,
    aheadCount: 0,
    behindCount: 0,
    pr: {
      number: 42,
      title: "PR branch",
      url: "https://github.com/pingdotgg/t3code/pull/42",
      baseRef: "main",
      headRef: "feature/current",
      state: "open",
    },
    ...overrides,
  };
}

describe("resolveThreadPr", () => {
  it("keeps local-checkout PR indicators scoped to the stored thread branch", () => {
    expect(
      resolveThreadPr({
        threadBranch: "feature/other",
        gitStatus: status(),
      }),
    ).toBeNull();
  });

  it("hides PR indicators when a dedicated worktree has switched away from the thread branch", () => {
    expect(
      resolveThreadPr({
        threadBranch: "stack/base",
        gitStatus: status(),
      }),
    ).toBeNull();
  });

  it("hides PR indicators when thread branch metadata is missing", () => {
    expect(
      resolveThreadPr({
        threadBranch: null,
        gitStatus: status(),
      }),
    ).toBeNull();
  });

  it("shows the PR when the live checkout matches the stored thread branch", () => {
    const gitStatus = status();

    expect(
      resolveThreadPr({
        threadBranch: "feature/current",
        gitStatus,
      }),
    ).toBe(gitStatus.pr);
  });
});

describe("prStatusIndicator", () => {
  it("formats PR tooltips with number, uppercase status, and title", () => {
    expect(prStatusIndicator(status().pr, undefined)).toMatchObject({
      tooltip: "PR #42 - Open: PR branch",
      tooltipLead: "PR #42 - Open",
      tooltipTitle: "PR branch",
    });
  });

  it("uses red for closed pull requests", () => {
    const closedPr = status().pr;
    if (!closedPr) throw new Error("Expected pull request fixture");

    expect(prStatusIndicator({ ...closedPr, state: "closed" }, undefined)?.colorClass).toContain(
      "text-red-600",
    );
  });
});

describe("settledPrHoverColorClass", () => {
  it.each([
    ["open", "text-emerald-600"],
    ["merged", "text-violet-600"],
    ["closed", "text-red-600"],
  ] as const)("restores the %s pull request color on row hover", (state, colorClass) => {
    expect(settledPrHoverColorClass(state)).toContain(`group-hover/v2-row:${colorClass}`);
  });
});
