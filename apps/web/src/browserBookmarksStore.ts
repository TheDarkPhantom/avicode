/**
 * Avi Code addition: global bookmarks for the in-app browser.
 *
 * Bookmarks are personal and shared across every preview tab, thread, and
 * project, so they live in one flat, persisted list rather than being scoped to
 * a thread. The bar that shows them only appears on the preview's empty state
 * (no page loaded); see `PreviewBookmarksBar`.
 */
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage } from "./lib/storage";
import { randomUUID } from "./lib/utils";

export interface Bookmark {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

const BOOKMARKS_STORAGE_KEY = "t3code:browser-bookmarks:v1";

/** Trims a name/url pair; returns null when either is empty after trimming. */
export function normalizeBookmarkInput(
  name: string,
  url: string,
): { name: string; url: string } | null {
  const trimmedName = name.trim();
  const trimmedUrl = url.trim();
  if (trimmedName.length === 0 || trimmedUrl.length === 0) return null;
  return { name: trimmedName, url: trimmedUrl };
}

interface BrowserBookmarksStoreState {
  readonly bookmarks: Bookmark[];
  /** Adds a bookmark; no-ops when name or url is blank. Returns the new id. */
  readonly addBookmark: (name: string, url: string) => string | null;
  readonly renameBookmark: (id: string, name: string) => void;
  readonly editBookmarkUrl: (id: string, url: string) => void;
  readonly removeBookmark: (id: string) => void;
}

export const useBrowserBookmarksStore = create<BrowserBookmarksStoreState>()(
  persist(
    (set) => ({
      bookmarks: [],
      addBookmark: (name, url) => {
        const normalized = normalizeBookmarkInput(name, url);
        if (!normalized) return null;
        const id = randomUUID();
        set((state) => ({ bookmarks: [...state.bookmarks, { id, ...normalized }] }));
        return id;
      },
      renameBookmark: (id, name) =>
        set((state) => {
          const trimmed = name.trim();
          if (trimmed.length === 0) return state;
          return {
            bookmarks: state.bookmarks.map((bookmark) =>
              bookmark.id === id ? { ...bookmark, name: trimmed } : bookmark,
            ),
          };
        }),
      editBookmarkUrl: (id, url) =>
        set((state) => {
          const trimmed = url.trim();
          if (trimmed.length === 0) return state;
          return {
            bookmarks: state.bookmarks.map((bookmark) =>
              bookmark.id === id ? { ...bookmark, url: trimmed } : bookmark,
            ),
          };
        }),
      removeBookmark: (id) =>
        set((state) => ({ bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== id) })),
    }),
    {
      name: BOOKMARKS_STORAGE_KEY,
      storage: createJSONStorage(() =>
        resolveStorage(typeof window !== "undefined" ? window.localStorage : undefined),
      ),
      partialize: (state) => ({ bookmarks: state.bookmarks }),
    },
  ),
);
