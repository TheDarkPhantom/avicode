import { ProjectId, ThreadId } from "@t3tools/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";

import {
  assignProjectToFolder,
  createProjectFolder,
  deleteProjectFolder,
  legacyProjectCwdPreferenceKey,
  markThreadUnread,
  markThreadVisited,
  parsePersistedState,
  PERSISTED_STATE_KEY,
  type PersistedUiState,
  type ProjectFolder,
  persistState,
  readPersistedState,
  renameProjectFolder,
  reorderProjectFolders,
  reorderProjects,
  resolveProjectExpanded,
  setDefaultAdvertisedEndpointKey,
  setProjectExpanded,
  setProjectFolderCollapsed,
  setProjectFolderHidden,
  setProjectPinned,
  setThreadChangedFilesExpanded,
  setThreadPlanExpanded,
  setThreadPlanReadingAnchor,
  setThreadPinned,
  type UiState,
  useUiStateStore,
} from "./uiStateStore";

function makeUiState(overrides: Partial<UiState> = {}): UiState {
  return {
    projectExpandedById: {},
    projectOrder: [],
    pinnedProjectKeys: [],
    pinnedThreadKeys: [],
    projectFolders: [],
    threadLastVisitedAtById: {},
    threadChangedFilesExpandedById: {},
    threadPlanReadingStateById: {},
    defaultAdvertisedEndpointKey: null,
    ...overrides,
  };
}

describe("uiStateStore pure functions", () => {
  it("stores server timestamps without moving visit state backwards", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState();
    const visited = markThreadVisited(initialState, threadId, "2026-02-25T12:30:00.700Z");

    expect(visited.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:30:00.700Z");
    expect(markThreadVisited(visited, threadId, "2026-02-25T12:30:00.000Z")).toBe(visited);
    expect(markThreadVisited(visited, threadId, "not-a-date")).toBe(visited);
  });

  it("marks a completed thread unread using the server completion timestamp", () => {
    const threadId = ThreadId.make("thread-1");
    const initialState = makeUiState({
      threadLastVisitedAtById: {
        [threadId]: "2026-02-25T12:35:00.000Z",
      },
    });

    const next = markThreadUnread(initialState, threadId, "2026-02-25T12:30:00.000Z");

    expect(next.threadLastVisitedAtById[threadId]).toBe("2026-02-25T12:29:59.999Z");
    expect(markThreadUnread(next, threadId, null)).toBe(next);
  });

  it("resolves project expansion from logical, physical, and legacy preference keys", () => {
    const physicalKey = "environment:/repo/project";
    const legacyKey = legacyProjectCwdPreferenceKey("/repo/project");

    expect(resolveProjectExpanded({ logical: false, [physicalKey]: true }, ["logical"])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [physicalKey]: false }, ["new-logical", physicalKey])).toBe(
      false,
    );
    expect(resolveProjectExpanded({ [legacyKey]: false }, ["new-logical", legacyKey])).toBe(false);
    expect(resolveProjectExpanded({}, ["new-logical"])).toBe(true);
  });

  it("falls back to the supplied default only when no preference exists", () => {
    // Collapse-by-default: an unseen project follows the passed default…
    expect(resolveProjectExpanded({}, ["unseen"], false)).toBe(false);
    expect(resolveProjectExpanded({}, ["unseen"], true)).toBe(true);
    // …but an explicit per-project choice still wins over the default.
    expect(resolveProjectExpanded({ seen: true }, ["seen"], false)).toBe(true);
    expect(resolveProjectExpanded({ seen: false }, ["seen"], true)).toBe(false);
  });

  it("sets expansion for every stable key belonging to a logical project", () => {
    const initialState = makeUiState();
    const keys = ["logical", "environment-a:/repo", "environment-b:/repo"];

    const next = setProjectExpanded(initialState, keys, false);

    expect(next.projectExpandedById).toEqual({
      logical: false,
      "environment-a:/repo": false,
      "environment-b:/repo": false,
    });
    expect(setProjectExpanded(next, keys, false)).toBe(next);
  });

  it("reorders from the current atom-derived project order", () => {
    const project1 = ProjectId.make("project-1");
    const project2 = ProjectId.make("project-2");
    const project3 = ProjectId.make("project-3");
    const currentOrder = [project1, project2, project3];

    const next = reorderProjects(makeUiState(), currentOrder, [project1], [project3]);

    expect(next.projectOrder).toEqual([project2, project3, project1]);
  });

  it("moves grouped project members together", () => {
    const keyALocal = "env-local:proj-a";
    const keyARemote = "env-remote:proj-a";
    const keyB = "env-local:proj-b";
    const keyC = "env-local:proj-c";
    const currentOrder = [keyALocal, keyARemote, keyB, keyC];

    const next = reorderProjects(makeUiState(), currentOrder, [keyALocal, keyARemote], [keyC]);

    expect(next.projectOrder).toEqual([keyB, keyC, keyALocal, keyARemote]);
  });

  it("does not reorder missing or identical groups", () => {
    const currentOrder = ["env-local:proj-a", "env-local:proj-b"];
    const state = makeUiState();

    expect(reorderProjects(state, currentOrder, ["env-local:missing"], ["env-local:proj-b"])).toBe(
      state,
    );
    expect(reorderProjects(state, currentOrder, ["env-local:proj-a"], ["env-local:proj-a"])).toBe(
      state,
    );
  });

  it("stores explicit changed-file expansion choices", () => {
    const threadId = ThreadId.make("thread-1");
    const collapsed = setThreadChangedFilesExpanded(makeUiState(), threadId, "turn-1", false);

    expect(collapsed.threadChangedFilesExpandedById).toEqual({
      [threadId]: {
        "turn-1": false,
      },
    });
    expect(
      setThreadChangedFilesExpanded(collapsed, threadId, "turn-1", true)
        .threadChangedFilesExpandedById,
    ).toEqual({
      [threadId]: {
        "turn-1": true,
      },
    });
  });

  it("stores plan expansion and reading anchors by scoped thread", () => {
    const expanded = setThreadPlanExpanded(makeUiState(), "env:thread-1", "plan-1", true, 1);
    const anchored = setThreadPlanReadingAnchor(
      expanded,
      "env:thread-1",
      { rowId: "plan-1", offsetWithinRow: 42 },
      2,
    );
    expect(anchored.threadPlanReadingStateById["env:thread-1"]).toEqual({
      expandedPlanIds: ["plan-1"],
      anchor: { rowId: "plan-1", offsetWithinRow: 42 },
      lastAccessedAt: 2,
    });
    expect(
      setThreadPlanExpanded(anchored, "env:thread-1", "plan-1", false, 3)
        .threadPlanReadingStateById["env:thread-1"]?.expandedPlanIds,
    ).toEqual([]);
  });

  it("clears a stored reading anchor while keeping plan expansion", () => {
    const expanded = setThreadPlanExpanded(makeUiState(), "env:thread-1", "plan-1", true, 1);
    const anchored = setThreadPlanReadingAnchor(
      expanded,
      "env:thread-1",
      { rowId: "plan-1", offsetWithinRow: 42 },
      2,
    );
    const cleared = setThreadPlanReadingAnchor(anchored, "env:thread-1", null, 3);
    expect(cleared.threadPlanReadingStateById["env:thread-1"]).toEqual({
      expandedPlanIds: ["plan-1"],
      anchor: null,
      lastAccessedAt: 3,
    });
  });

  it("leaves state untouched when clearing a thread with no anchor", () => {
    const state = makeUiState();
    expect(setThreadPlanReadingAnchor(state, "env:thread-1", null, 1)).toBe(state);
  });

  it("bounds transient plan reading state to fifty recent threads", () => {
    let state = makeUiState();
    for (let index = 0; index < 51; index++) {
      state = setThreadPlanExpanded(state, `env:thread-${index}`, "plan", true, index);
    }
    expect(Object.keys(state.threadPlanReadingStateById)).toHaveLength(50);
    expect(state.threadPlanReadingStateById["env:thread-0"]).toBeUndefined();
    expect(state.threadPlanReadingStateById["env:thread-50"]).toBeDefined();
  });

  it("stores the endpoint preference by stable key", () => {
    const next = setDefaultAdvertisedEndpointKey(makeUiState(), "desktop-core:lan:http");

    expect(next.defaultAdvertisedEndpointKey).toBe("desktop-core:lan:http");
    expect(setDefaultAdvertisedEndpointKey(next, "desktop-core:lan:http")).toBe(next);
    expect(setDefaultAdvertisedEndpointKey(next, "")).toMatchObject({
      defaultAdvertisedEndpointKey: null,
    });
  });
});

// Avi Code addition: pinned sidebar rows.
describe("uiStateStore pinning", () => {
  it("appends pins so an existing pin never moves", () => {
    const first = setThreadPinned(makeUiState(), "environment:thread-1", true);
    const second = setThreadPinned(first, "environment:thread-2", true);

    expect(second.pinnedThreadKeys).toEqual(["environment:thread-1", "environment:thread-2"]);
  });

  it("returns the same state when a pin would not change anything", () => {
    const pinned = setThreadPinned(makeUiState(), "environment:thread-1", true);

    expect(setThreadPinned(pinned, "environment:thread-1", true)).toBe(pinned);
    expect(setThreadPinned(pinned, "environment:thread-2", false)).toBe(pinned);
    expect(setThreadPinned(pinned, "", true)).toBe(pinned);
    expect(setThreadPinned(pinned, [], true)).toBe(pinned);
  });

  it("unpins without disturbing the order of the remaining pins", () => {
    const state = makeUiState({ pinnedThreadKeys: ["a", "b", "c"] });

    expect(setThreadPinned(state, "b", false).pinnedThreadKeys).toEqual(["a", "c"]);
  });

  it("pins and unpins every member of a grouped project at once", () => {
    const pinned = setProjectPinned(makeUiState(), ["member-1", "member-2"], true);
    expect(pinned.pinnedProjectKeys).toEqual(["member-1", "member-2"]);

    const unpinned = setProjectPinned(pinned, ["member-1", "member-2"], false);
    expect(unpinned.pinnedProjectKeys).toEqual([]);
  });

  it("adds only the members that are missing when a group is partly pinned", () => {
    const state = makeUiState({ pinnedProjectKeys: ["member-1"] });

    expect(setProjectPinned(state, ["member-1", "member-2"], true).pinnedProjectKeys).toEqual([
      "member-1",
      "member-2",
    ]);
  });

  it("keeps project and thread pins in separate lists", () => {
    const state = setThreadPinned(
      setProjectPinned(makeUiState(), "project-key", true),
      "environment:thread-1",
      true,
    );

    expect(state.pinnedProjectKeys).toEqual(["project-key"]);
    expect(state.pinnedThreadKeys).toEqual(["environment:thread-1"]);
  });

  it("hydrates pins and drops malformed entries", () => {
    const parsed = parsePersistedState({
      pinnedProjectKeys: ["physical-a", "", "physical-a", 7 as unknown as string],
      pinnedThreadKeys: "nonsense" as unknown as string[],
    });

    expect(parsed.pinnedProjectKeys).toEqual(["physical-a"]);
    expect(parsed.pinnedThreadKeys).toEqual([]);
  });

  it("defaults to no pins for state saved before the feature existed", () => {
    const parsed = parsePersistedState({ projectOrder: ["physical-a"] });

    expect(parsed.pinnedProjectKeys).toEqual([]);
    expect(parsed.pinnedThreadKeys).toEqual([]);
  });
});

// Avi Code addition: user-defined sidebar project folders.
describe("uiStateStore project folders", () => {
  it("creates a folder with a trimmed name and no members", () => {
    const next = createProjectFolder(makeUiState(), "  Clients  ", "folder-1");

    expect(next.projectFolders).toEqual([
      { id: "folder-1", name: "Clients", projectKeys: [], collapsed: false, hidden: false },
    ]);
  });

  it("ignores a blank folder name", () => {
    const state = makeUiState();
    expect(createProjectFolder(state, "   ", "folder-1")).toBe(state);
  });

  it("renames a folder and leaves state untouched when nothing changes", () => {
    const created = createProjectFolder(makeUiState(), "Clients", "folder-1");

    expect(renameProjectFolder(created, "folder-1", "Work").projectFolders[0]?.name).toBe("Work");
    expect(renameProjectFolder(created, "folder-1", "Clients")).toBe(created);
    expect(renameProjectFolder(created, "missing", "Work")).toBe(created);
    expect(renameProjectFolder(created, "folder-1", "  ")).toBe(created);
  });

  it("assigns a project to one folder, moving it out of any other", () => {
    let state = createProjectFolder(makeUiState(), "Clients", "folder-1");
    state = createProjectFolder(state, "Personal", "folder-2");

    const assigned = assignProjectToFolder(state, "proj-a", "folder-1");
    expect(assigned.projectFolders[0]?.projectKeys).toEqual(["proj-a"]);

    const moved = assignProjectToFolder(assigned, "proj-a", "folder-2");
    expect(moved.projectFolders[0]?.projectKeys).toEqual([]);
    expect(moved.projectFolders[1]?.projectKeys).toEqual(["proj-a"]);
  });

  it("removes a project from all folders when the target is null", () => {
    let state = createProjectFolder(makeUiState(), "Clients", "folder-1");
    state = assignProjectToFolder(state, "proj-a", "folder-1");

    const ungrouped = assignProjectToFolder(state, "proj-a", null);
    expect(ungrouped.projectFolders[0]?.projectKeys).toEqual([]);
    // Removing an already-ungrouped project changes nothing.
    expect(assignProjectToFolder(ungrouped, "proj-a", null)).toBe(ungrouped);
  });

  it("toggles folder collapse and no-ops on unchanged or missing folders", () => {
    const created = createProjectFolder(makeUiState(), "Clients", "folder-1");

    expect(setProjectFolderCollapsed(created, "folder-1", true).projectFolders[0]?.collapsed).toBe(
      true,
    );
    expect(setProjectFolderCollapsed(created, "folder-1", false)).toBe(created);
    expect(setProjectFolderCollapsed(created, "missing", true)).toBe(created);
  });

  it("deletes a folder so its projects fall back to ungrouped", () => {
    let state = createProjectFolder(makeUiState(), "Clients", "folder-1");
    state = assignProjectToFolder(state, "proj-a", "folder-1");

    expect(deleteProjectFolder(state, "folder-1").projectFolders).toEqual([]);
    expect(deleteProjectFolder(state, "missing")).toBe(state);
  });

  it("round-trips folders through persistence, dropping id-less junk but repairing blank names", () => {
    let state = createProjectFolder(makeUiState(), "Clients", "folder-1");
    state = assignProjectToFolder(state, "proj-a", "folder-1");

    expect(parsePersistedState(toPersisted(state)).projectFolders).toEqual(state.projectFolders);

    const sanitized = parsePersistedState({
      // Deliberately legacy/malformed JSON: entries predate the `hidden` field
      // and some are junk, so the array is cast past the typed shape.
      projectFolders: [
        { id: "ok", name: "Keep", projectKeys: ["proj-a", "", "proj-a"], collapsed: true },
        { id: "", name: "no id", projectKeys: [], collapsed: false },
        { id: "no-name", name: "   ", projectKeys: [], collapsed: false },
        "nonsense",
      ] as unknown as ProjectFolder[],
    });
    // A folder with no usable id (or non-object junk) is dropped, but a blank
    // name is recoverable so the folder is kept with a default label rather than
    // silently losing its grouping.
    expect(sanitized.projectFolders).toEqual([
      { id: "ok", name: "Keep", projectKeys: ["proj-a"], collapsed: true, hidden: false },
      { id: "no-name", name: "Untitled folder", projectKeys: [], collapsed: false, hidden: false },
    ]);
  });

  it("defaults to no folders for state saved before the feature existed", () => {
    expect(parsePersistedState({ projectOrder: ["physical-a"] }).projectFolders).toEqual([]);
  });

  it("toggles folder visibility and no-ops on unchanged or missing folders", () => {
    const created = createProjectFolder(makeUiState(), "Clients", "folder-1");

    expect(setProjectFolderHidden(created, "folder-1", true).projectFolders[0]?.hidden).toBe(true);
    expect(setProjectFolderHidden(created, "folder-1", false)).toBe(created);
    expect(setProjectFolderHidden(created, "missing", true)).toBe(created);
  });

  it("defaults hidden to false for folders saved before the feature existed", () => {
    const parsed = parsePersistedState({
      // Legacy folder JSON with no `hidden` key, cast past the typed shape.
      projectFolders: [
        { id: "legacy", name: "Legacy", projectKeys: [], collapsed: false },
      ] as unknown as ProjectFolder[],
    });
    expect(parsed.projectFolders[0]?.hidden).toBe(false);
  });

  it("reorders folders to the given id order", () => {
    let state = createProjectFolder(makeUiState(), "A", "folder-a");
    state = createProjectFolder(state, "B", "folder-b");
    state = createProjectFolder(state, "C", "folder-c");

    const reordered = reorderProjectFolders(state, ["folder-c", "folder-a", "folder-b"]);
    expect(reordered.projectFolders.map((folder) => folder.id)).toEqual([
      "folder-c",
      "folder-a",
      "folder-b",
    ]);
  });

  it("keeps unlisted folders after the reordered ones", () => {
    let state = createProjectFolder(makeUiState(), "A", "folder-a");
    state = createProjectFolder(state, "B", "folder-b");
    state = createProjectFolder(state, "C", "folder-c");

    // Only the visible subset (a, b) is passed; the omitted folder trails.
    const reordered = reorderProjectFolders(state, ["folder-b", "folder-a"]);
    expect(reordered.projectFolders.map((folder) => folder.id)).toEqual([
      "folder-b",
      "folder-a",
      "folder-c",
    ]);
  });

  it("no-ops when the order is unchanged, empty, or all ids are unknown", () => {
    let state = createProjectFolder(makeUiState(), "A", "folder-a");
    state = createProjectFolder(state, "B", "folder-b");

    expect(reorderProjectFolders(state, ["folder-a", "folder-b"])).toBe(state);
    expect(reorderProjectFolders(state, [])).toBe(state);
    expect(reorderProjectFolders(state, ["missing"])).toBe(state);
  });
});

function toPersisted(state: UiState): PersistedUiState {
  return {
    projectExpandedById: state.projectExpandedById,
    projectOrder: state.projectOrder,
    pinnedProjectKeys: state.pinnedProjectKeys,
    pinnedThreadKeys: state.pinnedThreadKeys,
    projectFolders: state.projectFolders,
    threadLastVisitedAtById: state.threadLastVisitedAtById,
    defaultAdvertisedEndpointKey: state.defaultAdvertisedEndpointKey,
  };
}

describe("parsePersistedState", () => {
  it("hydrates raw UI-owned state without server entities", () => {
    const parsed = parsePersistedState({
      projectExpandedById: {
        logical: false,
        invalid: "no" as unknown as boolean,
      },
      projectOrder: ["physical-b", "", "physical-a", "physical-b"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
        invalid: "not-a-date",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 1,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
    });

    expect(parsed).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      pinnedProjectKeys: [],
      pinnedThreadKeys: [],
      projectFolders: [],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      threadPlanReadingStateById: {},
    });
  });

  it("ignores changed-file expansion values saved with legacy folder semantics", () => {
    const parsed = parsePersistedState({
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
        },
      },
    });

    expect(parsed.threadChangedFilesExpandedById).toEqual({});
  });

  it("migrates legacy CWD project preferences into local alias keys", () => {
    const parsed = parsePersistedState({
      collapsedProjectCwds: ["/repo/b"],
      expandedProjectCwds: ["/repo/a"],
      projectOrderCwds: ["/repo/b", "/repo/a"],
    });
    const projectAKey = legacyProjectCwdPreferenceKey("/repo/a");
    const projectBKey = legacyProjectCwdPreferenceKey("/repo/b");

    expect(parsed.projectOrder).toEqual([projectBKey, projectAKey]);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectAKey])).toBe(true);
    expect(resolveProjectExpanded(parsed.projectExpandedById, [projectBKey])).toBe(false);
    expect(resolveProjectExpanded(parsed.projectExpandedById, ["unknown"])).toBe(true);
  });

  it("preserves legacy expanded-only semantics for one-way migration", () => {
    const parsed = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/a"),
      ]),
    ).toBe(true);
    expect(
      resolveProjectExpanded(parsed.projectExpandedById, [
        legacyProjectCwdPreferenceKey("/repo/b"),
      ]),
    ).toBe(false);
  });
});

function createLocalStorageStub(): Storage {
  const store = new Map<string, string>();
  return {
    clear: () => {
      store.clear();
    },
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, value);
    },
  };
}

describe("uiStateStore persistence", () => {
  let localStorageStub: Storage;

  beforeEach(() => {
    localStorageStub = createLocalStorageStub();
    vi.stubGlobal("window", { localStorage: localStorageStub });
    vi.stubGlobal("localStorage", localStorageStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persists raw UI preferences including thread visit markers", () => {
    const state = makeUiState({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
    });

    persistState(state);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted).toEqual({
      projectExpandedById: {
        logical: false,
      },
      projectOrder: ["physical-b", "physical-a"],
      pinnedProjectKeys: [],
      pinnedThreadKeys: [],
      projectFolders: [],
      threadLastVisitedAtById: {
        "environment:thread-1": "2026-02-25T12:35:00.000Z",
      },
      defaultAdvertisedEndpointKey: "desktop-core:lan:http",
      threadChangedFilesExpansionVersion: 1,
      threadChangedFilesExpandedById: {
        "environment:thread-1": {
          "turn-1": false,
          "turn-2": true,
        },
      },
    });
    expect(persisted).not.toHaveProperty("threadPlanReadingStateById");
    expect(parsePersistedState(persisted)).toEqual({
      ...state,
    });
  });

  it("drops the temporary expanded-only migration fallback when rewriting state", () => {
    const migrated = parsePersistedState({
      expandedProjectCwds: ["/repo/a"],
    });

    persistState(migrated);

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(resolveProjectExpanded(persisted.projectExpandedById ?? {}, ["unknown"])).toBe(true);
  });

  it("backs up a corrupt persisted value instead of silently wiping it", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    localStorageStub.setItem(PERSISTED_STATE_KEY, "{ not valid json");

    const recovered = readPersistedState();

    // A failed parse resets to defaults rather than throwing…
    expect(recovered.projectFolders).toEqual([]);
    expect(recovered.pinnedProjectKeys).toEqual([]);
    // …but the raw value is preserved under a timestamped backup key and the
    // loss is logged, so folders/pins are recoverable and no longer vanish
    // without a trace.
    const backupKey = [...Array(localStorageStub.length).keys()]
      .map((index) => localStorageStub.key(index)!)
      .find((key) => key.startsWith(`${PERSISTED_STATE_KEY}:corrupt-`));
    expect(backupKey).toBeDefined();
    expect(localStorageStub.getItem(backupKey!)).toBe("{ not valid json");
    expect(warn).toHaveBeenCalledOnce();

    warn.mockRestore();
  });

  it("writes visit markers at once so lock or process loss cannot drop them", () => {
    useUiStateStore.setState({ threadLastVisitedAtById: {} });
    useUiStateStore
      .getState()
      .markThreadVisited("environment:thread-1", "2026-08-14T00:00:00.000Z");

    const persisted = JSON.parse(
      localStorageStub.getItem(PERSISTED_STATE_KEY) ?? "{}",
    ) as PersistedUiState;
    expect(persisted.threadLastVisitedAtById).toEqual({
      "environment:thread-1": "2026-08-14T00:00:00.000Z",
    });
  });
});
