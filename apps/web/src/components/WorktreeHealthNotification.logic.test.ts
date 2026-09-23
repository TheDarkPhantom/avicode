import type { WorktreeHealthSnapshot } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import type { WorktreeHealthDismissal } from "../worktreeHealthDismissal";
import {
  shouldShowWorktreeHealthToast,
  worktreeHealthToastCopy,
} from "./WorktreeHealthNotification.logic";

const GB = 1024 * 1024 * 1024;

function snapshot(overrides: Partial<WorktreeHealthSnapshot> = {}): WorktreeHealthSnapshot {
  return {
    checkedAt: "2026-09-24T00:00:00.000Z",
    trigger: "interval",
    freeBytes: 100 * GB,
    totalBytes: 500 * GB,
    deadCount: 90,
    deadCleanCount: 90,
    deadDirtyCount: 0,
    perProject: [],
    thresholds: { deadCountThreshold: 80, lowDiskGb: 20 },
    breached: true,
    breachReasons: ["dead-count"],
    autoCleanup: null,
    ...overrides,
  };
}

const NOW = Date.parse("2026-09-24T12:00:00.000Z");

describe("shouldShowWorktreeHealthToast", () => {
  it("does not show when there is no snapshot", () => {
    expect(shouldShowWorktreeHealthToast({ snapshot: null, dismissal: null, nowMs: NOW })).toBe(
      false,
    );
  });

  it("does not show when the snapshot is not breached", () => {
    expect(
      shouldShowWorktreeHealthToast({
        snapshot: snapshot({ breached: false }),
        dismissal: null,
        nowMs: NOW,
      }),
    ).toBe(false);
  });

  it("shows a breached snapshot with no dismissal", () => {
    expect(
      shouldShowWorktreeHealthToast({ snapshot: snapshot(), dismissal: null, nowMs: NOW }),
    ).toBe(true);
  });

  it("stays hidden within a day of a matching dismissal", () => {
    const dismissal: WorktreeHealthDismissal = {
      dismissedAt: "2026-09-24T06:00:00.000Z",
      deadCleanCount: 90,
      freeBytes: 100 * GB,
    };
    expect(shouldShowWorktreeHealthToast({ snapshot: snapshot(), dismissal, nowMs: NOW })).toBe(
      false,
    );
  });

  it("re-appears a day after dismissal", () => {
    const dismissal: WorktreeHealthDismissal = {
      dismissedAt: "2026-09-23T06:00:00.000Z",
      deadCleanCount: 90,
      freeBytes: 100 * GB,
    };
    expect(shouldShowWorktreeHealthToast({ snapshot: snapshot(), dismissal, nowMs: NOW })).toBe(
      true,
    );
  });

  it("re-appears when the dead count grows", () => {
    const dismissal: WorktreeHealthDismissal = {
      dismissedAt: "2026-09-24T06:00:00.000Z",
      deadCleanCount: 90,
      freeBytes: 100 * GB,
    };
    expect(
      shouldShowWorktreeHealthToast({
        snapshot: snapshot({ deadCleanCount: 95 }),
        dismissal,
        nowMs: NOW,
      }),
    ).toBe(true);
  });

  it("re-appears when free space drops by more than a gigabyte", () => {
    const dismissal: WorktreeHealthDismissal = {
      dismissedAt: "2026-09-24T06:00:00.000Z",
      deadCleanCount: 90,
      freeBytes: 100 * GB,
    };
    expect(
      shouldShowWorktreeHealthToast({
        snapshot: snapshot({ freeBytes: 98 * GB, breachReasons: ["low-disk"] }),
        dismissal,
        nowMs: NOW,
      }),
    ).toBe(true);
  });
});

describe("worktreeHealthToastCopy", () => {
  it("summarizes a dead-count breach", () => {
    const copy = worktreeHealthToastCopy(snapshot());
    expect(copy.title).toContain("90 dead worktrees");
  });

  it("mentions auto-cleanup results and dirty leftovers", () => {
    const copy = worktreeHealthToastCopy(
      snapshot({
        deadCleanCount: 0,
        deadDirtyCount: 3,
        autoCleanup: { removedCount: 88, failedCount: 0, freedBytes: 20 * GB },
      }),
    );
    expect(copy.description).toContain("Removed 88");
    expect(copy.description).toContain("3 with uncommitted changes");
  });

  it("names low disk when that is the breach", () => {
    const copy = worktreeHealthToastCopy(
      snapshot({ breachReasons: ["low-disk"], freeBytes: 5 * GB }),
    );
    expect(copy.title.toLowerCase()).toContain("disk");
  });
});
