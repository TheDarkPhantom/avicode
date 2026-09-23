import type {
  ProjectId,
  VcsExecuteCleanupInput,
  WorktreeCleanupCandidate,
  WorktreeCleanupReason,
} from "@t3tools/contracts";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import { BackgroundPolicy } from "../background/BackgroundPolicy.ts";
import * as ServerConfigModule from "../config.ts";
import { ProjectionProjectRepository } from "../persistence/Services/ProjectionProjects.ts";
import { ServerSettingsService } from "../serverSettings.ts";
import { WorktreeCleanupService } from "./WorktreeCleanup.ts";
import {
  evaluateWorktreeHealth,
  makeWorktreeHealthMonitor,
  selectAutoCleanupCandidates,
  type DiskUsage,
} from "./WorktreeHealthMonitor.ts";

const GB = 1024 * 1024 * 1024;

function candidate(
  overrides: Partial<WorktreeCleanupCandidate> & { worktreePath: string },
): WorktreeCleanupCandidate {
  return {
    branch: "feature/x",
    threadId: null,
    threadIds: [],
    reason: "archived" as WorktreeCleanupReason,
    diskBytes: 0,
    isDirty: false,
    isActive: false,
    ...overrides,
  };
}

describe("evaluateWorktreeHealth", () => {
  const thresholds = { deadCountThreshold: 80, lowDiskGb: 20 };

  it("does not breach below both thresholds", () => {
    const result = evaluateWorktreeHealth({
      deadCleanCount: 5,
      freeBytes: 100 * GB,
      thresholds,
    });
    expect(result.breached).toBe(false);
    expect(result.breachReasons).toEqual([]);
  });

  it("breaches on dead count at the threshold", () => {
    const result = evaluateWorktreeHealth({ deadCleanCount: 80, freeBytes: 100 * GB, thresholds });
    expect(result.breached).toBe(true);
    expect(result.breachReasons).toEqual(["dead-count"]);
  });

  it("breaches on low disk", () => {
    const result = evaluateWorktreeHealth({ deadCleanCount: 1, freeBytes: 5 * GB, thresholds });
    expect(result.breachReasons).toEqual(["low-disk"]);
  });

  it("reports both reasons when both cross", () => {
    const result = evaluateWorktreeHealth({ deadCleanCount: 90, freeBytes: 1 * GB, thresholds });
    expect(result.breachReasons).toEqual(["dead-count", "low-disk"]);
  });

  it("skips the disk rule when the low-disk mark is 0", () => {
    const result = evaluateWorktreeHealth({
      deadCleanCount: 1,
      freeBytes: 0,
      thresholds: { deadCountThreshold: 80, lowDiskGb: 0 },
    });
    expect(result.breached).toBe(false);
  });

  it("skips the disk rule when free space is unknown", () => {
    const result = evaluateWorktreeHealth({ deadCleanCount: 1, freeBytes: null, thresholds });
    expect(result.breached).toBe(false);
  });
});

describe("selectAutoCleanupCandidates", () => {
  it("keeps only clean, inactive, auto-eligible reasons", () => {
    const candidates = [
      candidate({ worktreePath: "/w/a", reason: "archived" }),
      candidate({ worktreePath: "/w/b", reason: "settled" }),
      candidate({ worktreePath: "/w/c", reason: "orphaned" }),
      candidate({ worktreePath: "/w/d", reason: "pr-merged" }),
      candidate({ worktreePath: "/w/e", reason: "pr-closed" }),
      candidate({ worktreePath: "/w/f", reason: "archived", isDirty: true }),
      candidate({ worktreePath: "/w/g", reason: "archived", isActive: true }),
    ];
    const selected = selectAutoCleanupCandidates(candidates).map((c) => c.worktreePath);
    expect(selected).toEqual(["/w/a", "/w/b", "/w/c", "/w/d"]);
  });
});

const project = (id: string, workspaceRoot: string) => ({
  projectId: id as ProjectId,
  title: id,
  workspaceRoot,
  defaultModelSelection: null,
  scripts: [],
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  deletedAt: null,
});

interface MonitorHarnessOptions {
  readonly candidates: ReadonlyArray<WorktreeCleanupCandidate>;
  readonly settings?: Partial<typeof DEFAULT_SERVER_SETTINGS>;
  readonly disk?: ReadonlyArray<DiskUsage>;
  readonly executeResults?: (input: VcsExecuteCleanupInput) => ReadonlyArray<boolean>;
}

function harness(options: MonitorHarnessOptions) {
  const executeCalls: VcsExecuteCleanupInput[] = [];
  let diskCall = 0;
  const disk = options.disk ?? [{ freeBytes: 100 * GB, totalBytes: 500 * GB }];

  const cleanupLayer = Layer.mock(WorktreeCleanupService)({
    scan: () => Effect.succeed({ candidates: [], totalBytes: 0 }),
    classify: () => Effect.succeed(options.candidates),
    execute: (input) => {
      executeCalls.push(input);
      const oks = options.executeResults
        ? options.executeResults(input)
        : input.candidates.map(() => true);
      return Effect.succeed({
        results: input.candidates.map((c, i) => ({
          worktreePath: c.worktreePath,
          ok: oks[i] ?? true,
          error: null,
        })),
        reclaimedBytes: 0,
      });
    },
  });

  const projectRepoLayer = Layer.mock(ProjectionProjectRepository)({
    listAll: () => Effect.succeed([project("p1", "/repo/one")]),
  });

  const settingsLayer = Layer.mock(ServerSettingsService)({
    getSettings: Effect.succeed({ ...DEFAULT_SERVER_SETTINGS, ...options.settings }),
    streamChanges: Stream.empty,
  });

  const backgroundLayer = Layer.mock(BackgroundPolicy)({
    shouldRunOpportunisticWork: Effect.succeed(true),
  });

  const layer = Layer.mergeAll(
    cleanupLayer,
    projectRepoLayer,
    settingsLayer,
    backgroundLayer,
    ServerConfigModule.layerTest(process.cwd(), { prefix: "t3-wt-health-" }).pipe(
      Layer.provide(NodeServices.layer),
    ),
  );

  const measureDisk = (): Effect.Effect<DiskUsage> => {
    const value = disk[Math.min(diskCall, disk.length - 1)]!;
    diskCall += 1;
    return Effect.succeed(value);
  };

  const monitor = makeWorktreeHealthMonitor({ measureDisk }).pipe(Effect.provide(layer));
  return { monitor, executeCalls };
}

describe("WorktreeHealthMonitor.runCheck", () => {
  it.effect("does not run cleanup below thresholds", () =>
    Effect.gen(function* () {
      const { monitor, executeCalls } = harness({
        candidates: [candidate({ worktreePath: "/repo/one/wt/a" })],
        settings: { worktreeHealthDeadCountThreshold: 80, worktreeHealthLowDiskGb: 20 },
      });
      const service = yield* monitor;
      const snapshot = yield* service.runCheck({ trigger: "manual" });
      expect(snapshot.breached).toBe(false);
      expect(snapshot.autoCleanup).toBeNull();
      expect(executeCalls).toHaveLength(0);
      expect(snapshot.deadCleanCount).toBe(1);
    }),
  );

  it.effect("auto-removes only clean candidates when the dead count breaches", () =>
    Effect.gen(function* () {
      const { monitor, executeCalls } = harness({
        candidates: [
          candidate({ worktreePath: "/repo/one/wt/a", reason: "archived" }),
          candidate({ worktreePath: "/repo/one/wt/b", reason: "pr-merged" }),
          candidate({ worktreePath: "/repo/one/wt/dirty", isDirty: true }),
          candidate({ worktreePath: "/repo/one/wt/closed", reason: "pr-closed" }),
        ],
        settings: { worktreeHealthDeadCountThreshold: 2, worktreeHealthAutoCleanup: true },
        disk: [
          { freeBytes: 10 * GB, totalBytes: 500 * GB },
          { freeBytes: 30 * GB, totalBytes: 500 * GB },
        ],
      });
      const service = yield* monitor;
      const snapshot = yield* service.runCheck({ trigger: "interval" });

      expect(executeCalls).toHaveLength(1);
      const call = executeCalls[0]!;
      expect(call.deleteBranches).toBe(false);
      expect(call.pruneCheckpoints).toBe(false);
      expect(call.runGc).toBe(false);
      expect(call.candidates.map((c) => c.worktreePath)).toEqual([
        "/repo/one/wt/a",
        "/repo/one/wt/b",
      ]);
      expect(snapshot.autoCleanup).not.toBeNull();
      expect(snapshot.autoCleanup?.removedCount).toBe(2);
      expect(snapshot.autoCleanup?.freedBytes).toBe(20 * GB);
      // The two clean ones were removed; the dirty one remains.
      expect(snapshot.deadCleanCount).toBe(0);
      expect(snapshot.deadDirtyCount).toBe(1);
    }),
  );

  it.effect("does not run cleanup when auto-cleanup is disabled, but still reports breach", () =>
    Effect.gen(function* () {
      const { monitor, executeCalls } = harness({
        candidates: [
          candidate({ worktreePath: "/repo/one/wt/a" }),
          candidate({ worktreePath: "/repo/one/wt/b" }),
        ],
        settings: { worktreeHealthDeadCountThreshold: 2, worktreeHealthAutoCleanup: false },
      });
      const service = yield* monitor;
      const snapshot = yield* service.runCheck({ trigger: "manual" });
      expect(snapshot.breached).toBe(true);
      expect(snapshot.breachReasons).toContain("dead-count");
      expect(snapshot.autoCleanup).toBeNull();
      expect(executeCalls).toHaveLength(0);
    }),
  );

  it.effect("publishes the snapshot to streamChanges and current", () =>
    Effect.gen(function* () {
      const { monitor } = harness({
        candidates: [candidate({ worktreePath: "/repo/one/wt/a" })],
      });
      const service = yield* monitor;
      const returned = yield* service.runCheck({ trigger: "manual" });
      const current = yield* service.current;
      expect(current).toEqual(returned);
    }),
  );
});
