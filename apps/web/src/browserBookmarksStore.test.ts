import { beforeEach, describe, expect, it } from "vite-plus/test";

import { normalizeBookmarkInput, useBrowserBookmarksStore } from "./browserBookmarksStore";

const bookmarks = () => useBrowserBookmarksStore.getState().bookmarks;

beforeEach(() => {
  useBrowserBookmarksStore.setState({ bookmarks: [] });
});

describe("normalizeBookmarkInput", () => {
  it("trims name and url", () => {
    expect(normalizeBookmarkInput("  Docs  ", "  example.com  ")).toEqual({
      name: "Docs",
      url: "example.com",
    });
  });

  it("returns null when either field is blank", () => {
    expect(normalizeBookmarkInput("", "example.com")).toBeNull();
    expect(normalizeBookmarkInput("Docs", "   ")).toBeNull();
  });
});

describe("browserBookmarksStore", () => {
  it("adds a trimmed bookmark and returns its id", () => {
    const id = useBrowserBookmarksStore.getState().addBookmark("  Prod  ", "  ued-os.vercel.app ");
    expect(id).not.toBeNull();
    expect(bookmarks()).toEqual([{ id, name: "Prod", url: "ued-os.vercel.app" }]);
  });

  it("no-ops adding a blank name or url", () => {
    expect(useBrowserBookmarksStore.getState().addBookmark("", "example.com")).toBeNull();
    expect(useBrowserBookmarksStore.getState().addBookmark("Docs", "  ")).toBeNull();
    expect(bookmarks()).toEqual([]);
  });

  it("renames a bookmark, ignoring blank names", () => {
    const id = useBrowserBookmarksStore.getState().addBookmark("Prod", "example.com")!;
    useBrowserBookmarksStore.getState().renameBookmark(id, "  Production  ");
    expect(bookmarks()[0]?.name).toBe("Production");
    useBrowserBookmarksStore.getState().renameBookmark(id, "   ");
    expect(bookmarks()[0]?.name).toBe("Production");
  });

  it("edits a bookmark url", () => {
    const id = useBrowserBookmarksStore.getState().addBookmark("Dev", "localhost:3000")!;
    useBrowserBookmarksStore.getState().editBookmarkUrl(id, "localhost:5173");
    expect(bookmarks()[0]?.url).toBe("localhost:5173");
  });

  it("removes a bookmark", () => {
    const first = useBrowserBookmarksStore.getState().addBookmark("A", "a.com")!;
    const second = useBrowserBookmarksStore.getState().addBookmark("B", "b.com")!;
    useBrowserBookmarksStore.getState().removeBookmark(first);
    expect(bookmarks().map((bookmark) => bookmark.id)).toEqual([second]);
  });
});
