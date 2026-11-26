import { describe, expect, it } from "vite-plus/test";

import { createMemoryStorage } from "~/lib/storage";

import { createBrowserBookmarksStore, normalizeBookmarkInput } from "./browserBookmarksStore";

describe("browserBookmarksStore", () => {
  it("adds a bookmark with a trimmed name and a normalized URL", () => {
    const store = createBrowserBookmarksStore(createMemoryStorage());
    const id = store.getState().addBookmark("  Docs ", " example.com/docs ");
    expect(id).not.toBeNull();
    expect(store.getState().bookmarks).toEqual([
      { id, name: "Docs", url: "https://example.com/docs" },
    ]);
  });

  it("rejects a blank name or a URL the preview cannot open", () => {
    const store = createBrowserBookmarksStore(createMemoryStorage());
    expect(store.getState().addBookmark("  ", "example.com")).toBeNull();
    expect(store.getState().addBookmark("Mail", "mailto:me@example.com")).toBeNull();
    expect(store.getState().bookmarks).toEqual([]);
    expect(normalizeBookmarkInput("Local", "localhost:3000")).toEqual({
      name: "Local",
      url: "http://localhost:3000/",
    });
  });

  it("renames and edits a bookmark, ignoring an invalid edit", () => {
    const store = createBrowserBookmarksStore(createMemoryStorage());
    const id = store.getState().addBookmark("Docs", "https://example.com/");
    const otherId = store.getState().addBookmark("Other", "https://other.test/");
    if (!id || !otherId) throw new Error("expected bookmarks to be added");

    store.getState().updateBookmark(id, "Reference", "https://example.com/ref");
    store.getState().updateBookmark(otherId, "", "https://ignored.test/");

    expect(store.getState().bookmarks).toEqual([
      { id, name: "Reference", url: "https://example.com/ref" },
      { id: otherId, name: "Other", url: "https://other.test/" },
    ]);
  });

  it("removes only the named bookmark", () => {
    const store = createBrowserBookmarksStore(createMemoryStorage());
    const id = store.getState().addBookmark("Docs", "https://example.com/");
    const otherId = store.getState().addBookmark("Other", "https://other.test/");
    if (!id) throw new Error("expected a bookmark to be added");

    store.getState().removeBookmark(id);

    expect(store.getState().bookmarks.map((bookmark) => bookmark.id)).toEqual([otherId]);
  });

  it("persists bookmarks under the old Avi Code key and restores them", async () => {
    const storage = createMemoryStorage();
    const store = createBrowserBookmarksStore(storage);
    const id = store.getState().addBookmark("Docs", "https://example.com/");

    const persisted = JSON.parse(String(storage.getItem("t3code:browser-bookmarks:v1")));
    expect(persisted.state).toEqual({
      bookmarks: [{ id, name: "Docs", url: "https://example.com/" }],
    });

    const restored = createBrowserBookmarksStore(storage);
    await restored.persist.rehydrate();
    expect(restored.getState().bookmarks).toEqual([
      { id, name: "Docs", url: "https://example.com/" },
    ]);
  });
});
