import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import { EnvironmentId, ProviderInstanceId, RunId, ThreadId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  layoutSidebarFolders,
  type SidebarFolderLayoutInput,
  type SidebarFolderShelf,
  type SidebarFolderThread,
  sidebarThreadNeedsAttention,
} from "./sidebarFolderLayout";
import type { SidebarFolder } from "./sidebarFolders";

const environmentId = EnvironmentId.make("environment-local");

function thread(id: string, overrides: Partial<SidebarFolderThread> = {}): SidebarFolderThread {
  return {
    environmentId,
    id: ThreadId.make(id),
    hasActionableProposedPlan: false,
    hasPendingApprovals: false,
    hasPendingUserInput: false,
    pendingSubagentRequest: null,
    pendingGuestMessageCount: 0,
    interactionMode: "default",
    latestRun: null,
    runtime: null,
    lastVisitedAt: "2026-03-09T10:00:00.000Z",
    ...overrides,
  } as SidebarFolderThread;
}

function shelf(projectKey: string, threads: SidebarFolderThread[]): SidebarFolderShelf {
  return {
    group: { projectKey, memberProjects: [{ physicalProjectKey: `${projectKey}:physical` }] },
    collapsed: false,
    threads,
    hiddenThreads: [],
  };
}

const folder = (id: string, projectKeys: string[], overrides: Partial<SidebarFolder> = {}) => ({
  id,
  name: id,
  projectKeys,
  collapsed: false,
  hidden: false,
  ...overrides,
});

const input = (overrides: Partial<SidebarFolderLayoutInput> = {}): SidebarFolderLayoutInput => ({
  folders: [],
  showAttentionUnderCollapsed: false,
  localLastVisitedAtById: {},
  routeThreadKey: null,
  scoped: false,
  ...overrides,
});

function summarize(layout: ReturnType<typeof layoutSidebarFolders<SidebarFolderShelf>>) {
  return layout?.entries.map((entry) =>
    entry.kind === "folder"
      ? `folder ${entry.folder.id}${entry.folder.collapsed ? ` (${entry.hiddenThreadCount} hidden, ${entry.dot})` : ""}`
      : `${entry.shelf.group.projectKey}: ${entry.shelf.threads.map((row) => row.id).join(",")}`,
  );
}

function run(
  status: "completed" | "failed",
  completedAt: string,
): SidebarFolderThread["latestRun"] {
  return {
    runId: RunId.make("run-1"),
    status,
    assistantMessageId: null,
    requestedAt: "2026-03-09T09:00:00.000Z",
    startedAt: "2026-03-09T09:00:00.000Z",
    completedAt,
  };
}

const approval = thread("approval", { hasPendingApprovals: true });
const planReady = thread("plan", {
  interactionMode: "plan",
  hasActionableProposedPlan: true,
  latestRun: run("completed", "2026-03-09T09:30:00.000Z"),
});
const quiet = thread("quiet");

describe("layoutSidebarFolders", () => {
  it("passes upstream shelves through when there are no folders or a project filter", () => {
    const shelves = [shelf("a", [quiet])];
    expect(layoutSidebarFolders(null, input())).toBeNull();
    expect(layoutSidebarFolders(shelves, input())?.shelves).toBe(shelves);
    const scoped = layoutSidebarFolders(
      shelves,
      input({ folders: [folder("f", ["a"], { hidden: true })], scoped: true }),
    );
    expect(scoped?.shelves).toBe(shelves);
  });

  it("puts folders first in saved order, then shelves in no folder in upstream order", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", [quiet]), shelf("b", []), shelf("c", []), shelf("d", [])],
      input({
        folders: [folder("second", ["c"]), folder("first", ["a", "b"]), folder("empty", [])],
      }),
    );
    expect(summarize(layout)).toEqual([
      "folder second",
      "c: ",
      "folder first",
      "a: quiet",
      "b: ",
      "folder empty",
      "d: ",
    ]);
    expect(layout?.shelves.map((entry) => entry.group.projectKey)).toEqual(["c", "a", "b", "d"]);
  });

  it("matches a project saved under one of its physical keys", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", []), shelf("b", [])],
      input({ folders: [folder("f", ["b:physical"])] }),
    );
    expect(summarize(layout)).toEqual(["folder f", "b: ", "a: "]);
  });

  it("drops a hidden folder together with its projects", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", [approval]), shelf("b", [quiet])],
      input({ folders: [folder("f", ["a"], { hidden: true })], showAttentionUnderCollapsed: true }),
    );
    expect(summarize(layout)).toEqual(["b: quiet"]);
  });

  it("hides a collapsed folder's threads, counting them and showing the urgent dot", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", [approval, quiet]), shelf("b", [planReady])],
      input({ folders: [folder("f", ["a", "b"], { collapsed: true })] }),
    );
    expect(summarize(layout)).toEqual(["folder f (3 hidden, attention)"]);
    expect(layout?.shelves).toEqual([]);
  });

  it("keeps chats that need you under a collapsed folder when the setting is on", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", [approval, quiet]), shelf("b", [planReady]), shelf("c", [quiet])],
      input({
        folders: [folder("f", ["a", "b", "c"], { collapsed: true })],
        showAttentionUnderCollapsed: true,
      }),
    );
    expect(summarize(layout)).toEqual(["folder f (2 hidden, null)", "a: approval", "b: plan"]);
  });

  it("keeps the open thread under a collapsed folder", () => {
    const layout = layoutSidebarFolders(
      [shelf("a", [approval, quiet])],
      input({
        folders: [folder("f", ["a"], { collapsed: true })],
        routeThreadKey: scopedThreadKey(scopeThreadRef(environmentId, ThreadId.make("quiet"))),
      }),
    );
    expect(summarize(layout)).toEqual(["folder f (1 hidden, attention)", "a: quiet"]);
  });
});

describe("sidebarThreadNeedsAttention", () => {
  it("flags approval, input, failed runs and ready plans, not quiet or working threads", () => {
    expect(sidebarThreadNeedsAttention(approval)).toBe(true);
    expect(sidebarThreadNeedsAttention(thread("input", { hasPendingUserInput: true }))).toBe(true);
    expect(sidebarThreadNeedsAttention(planReady)).toBe(true);
    expect(
      sidebarThreadNeedsAttention(
        thread("failed", {
          latestRun: run("failed", "2026-03-09T10:40:00.000Z"),
        }),
      ),
    ).toBe(true);
    expect(sidebarThreadNeedsAttention(quiet)).toBe(false);
    expect(
      sidebarThreadNeedsAttention(
        thread("working", {
          runtime: {
            status: "running",
            activeRunId: null,
            providerInstanceId: ProviderInstanceId.make("codex"),
            providerName: "Codex",
            lastError: null,
            updatedAt: "2026-03-09T10:00:00.000Z",
          },
        }),
      ),
    ).toBe(false);
  });
});
