import { describe, expect, it, vi } from "vite-plus/test";

import {
  assignProjectToSidebarFolder,
  createSidebarFolder,
  deleteSidebarFolder,
  findSidebarFolderForProject,
  moveSidebarFolder,
  parseSidebarFolders,
  readSidebarFolders,
  renameSidebarFolder,
  setSidebarFolderCollapsed,
  setSidebarFolderHidden,
  SIDEBAR_FOLDERS_STORAGE_KEY,
  type SidebarFolder,
  type SidebarFolderStorage,
  sidebarFolderProjectKeys,
  UNTITLED_SIDEBAR_FOLDER_NAME,
} from "./sidebarFolders";

const folder = (id: string, overrides: Partial<SidebarFolder> = {}): SidebarFolder => ({
  id,
  name: id,
  projectKeys: [],
  collapsed: false,
  hidden: false,
  ...overrides,
});

function memoryStorage(entries: Record<string, string> = {}) {
  const items = new Map(Object.entries(entries));
  const storage: SidebarFolderStorage = {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
  return { storage, items };
}

describe("sidebar folder transforms", () => {
  it("creates a folder with a trimmed name and ignores a blank name or a taken id", () => {
    const created = createSidebarFolder([], "work", "  Work  ");
    expect(created).toEqual([folder("work", { name: "Work" })]);
    expect(createSidebarFolder(created, "other", "   ")).toBe(created);
    expect(createSidebarFolder(created, "work", "Again")).toBe(created);
  });

  it("renames, collapses and hides, returning the same list for a no-op", () => {
    const folders = [folder("a"), folder("b")];
    expect(renameSidebarFolder(folders, "a", " Clients ")[0]!.name).toBe("Clients");
    expect(renameSidebarFolder(folders, "a", "  ")).toBe(folders);
    expect(renameSidebarFolder(folders, "a", "a")).toBe(folders);
    expect(renameSidebarFolder(folders, "missing", "x")).toBe(folders);
    expect(setSidebarFolderCollapsed(folders, "b", true)[1]!.collapsed).toBe(true);
    expect(setSidebarFolderCollapsed(folders, "b", false)).toBe(folders);
    const hidden = setSidebarFolderHidden(folders, "a", true);
    expect(hidden[0]!.hidden).toBe(true);
    expect(setSidebarFolderHidden(hidden, "a", false)[0]!.hidden).toBe(false);
  });

  it("deletes a folder, leaving the rest in order", () => {
    const folders = [folder("a"), folder("b"), folder("c")];
    expect(deleteSidebarFolder(folders, "b").map((entry) => entry.id)).toEqual(["a", "c"]);
    expect(deleteSidebarFolder(folders, "missing")).toBe(folders);
  });

  it("keeps a project in at most one folder", () => {
    const folders = [folder("a", { projectKeys: ["p1"] }), folder("b")];
    const moved = assignProjectToSidebarFolder(folders, ["p1"], "b");
    expect(moved.map((entry) => entry.projectKeys)).toEqual([[], ["p1"]]);
    expect(assignProjectToSidebarFolder(moved, ["p1"], "b")).toBe(moved);
    expect(assignProjectToSidebarFolder(moved, ["p1"], null).map((e) => e.projectKeys)).toEqual([
      [],
      [],
    ]);
    expect(assignProjectToSidebarFolder(folders, ["p1"], "missing")).toBe(folders);
    expect(assignProjectToSidebarFolder(folders, ["p2"], null)).toBe(folders);
  });

  it("moves a project saved under an old key and stores its current key", () => {
    const folders = [folder("a", { projectKeys: ["physical-1"] }), folder("b")];
    const moved = assignProjectToSidebarFolder(folders, ["logical", "physical-1"], "a");
    expect(moved[0]!.projectKeys).toEqual(["logical"]);
    expect(findSidebarFolderForProject(folders, ["logical", "physical-1"])?.id).toBe("a");
    expect(findSidebarFolderForProject(folders, ["other"])).toBeNull();
  });

  it("reorders folders by index and clamps out-of-range moves", () => {
    const folders = [folder("a"), folder("b"), folder("c")];
    const ids = (list: readonly SidebarFolder[]) => list.map((entry) => entry.id);
    expect(ids(moveSidebarFolder(folders, "c", 0))).toEqual(["c", "a", "b"]);
    expect(ids(moveSidebarFolder(folders, "a", 2))).toEqual(["b", "c", "a"]);
    expect(ids(moveSidebarFolder(folders, "a", 9))).toEqual(["b", "c", "a"]);
    expect(moveSidebarFolder(folders, "a", -1)).toBe(folders);
    expect(moveSidebarFolder(folders, "missing", 1)).toBe(folders);
  });

  it("lists a project's canonical key first, then its physical keys", () => {
    expect(
      sidebarFolderProjectKeys({
        projectKey: "logical",
        memberProjects: [{ physicalProjectKey: "p1" }, { physicalProjectKey: "logical" }],
      }),
    ).toEqual(["logical", "p1"]);
  });
});

describe("parseSidebarFolders", () => {
  it("repairs blank names, duplicate members and bad flags instead of dropping folders", () => {
    expect(
      parseSidebarFolders([
        { id: "a", name: "  ", projectKeys: ["p1", "p1", "", 4], collapsed: "yes" },
        { id: "b", name: "Side", projectKeys: ["p1", "p2"], hidden: true },
        { id: "a", name: "Duplicate id" },
        { name: "No id" },
        "junk",
        null,
      ]),
    ).toEqual([
      folder("a", { name: UNTITLED_SIDEBAR_FOLDER_NAME, projectKeys: ["p1"] }),
      folder("b", { name: "Side", projectKeys: ["p2"], hidden: true }),
    ]);
    expect(parseSidebarFolders({ folders: [] })).toEqual([]);
  });
});

describe("readSidebarFolders", () => {
  it("reads saved folders", () => {
    const { storage } = memoryStorage({
      [SIDEBAR_FOLDERS_STORAGE_KEY]: JSON.stringify({ folders: [folder("a")] }),
    });
    expect(readSidebarFolders(storage)).toEqual([folder("a")]);
  });

  it("backs up unreadable JSON before starting with no folders", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { storage, items } = memoryStorage({ [SIDEBAR_FOLDERS_STORAGE_KEY]: "{not json" });
    expect(readSidebarFolders(storage, 1234)).toEqual([]);
    expect(items.get(`${SIDEBAR_FOLDERS_STORAGE_KEY}:corrupt-1234`)).toBe("{not json");
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("imports the first Avi Code's folders once when nothing is saved", () => {
    const legacy = JSON.stringify({
      projectOrder: [],
      projectFolders: [{ id: "old", name: "Clients", projectKeys: ["p1"], collapsed: true }],
    });
    const { storage, items } = memoryStorage({ "t3code:ui-state:v1": legacy });
    const imported = readSidebarFolders(storage);
    expect(imported).toEqual([
      folder("old", { name: "Clients", projectKeys: ["p1"], collapsed: true }),
    ]);
    expect(JSON.parse(items.get(SIDEBAR_FOLDERS_STORAGE_KEY)!)).toEqual({ folders: imported });
  });

  it("starts empty without writing when there is nothing to import", () => {
    const { storage, items } = memoryStorage({ "t3code:ui-state:v1": "{broken" });
    expect(readSidebarFolders(storage)).toEqual([]);
    expect(items.has(SIDEBAR_FOLDERS_STORAGE_KEY)).toBe(false);
  });
});
