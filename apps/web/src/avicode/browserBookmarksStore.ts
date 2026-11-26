import { normalizePreviewUrl } from "@t3tools/shared/preview";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { resolveStorage, type StateStorage } from "~/lib/storage";
import { randomUUID } from "~/lib/utils";

export interface Bookmark {
  readonly id: string;
  readonly name: string;
  readonly url: string;
}

// The old Avi Code's key, so a profile that carried its bookmarks keeps them.
const BOOKMARKS_STORAGE_KEY = "t3code:browser-bookmarks:v1";

/** The http(s) URL a bookmark opens, or null when the input is not one. */
function normalizeBookmarkUrl(url: string): string | null {
  try {
    return normalizePreviewUrl(url);
  } catch {
    return null;
  }
}

/** A trimmed name and normalized URL, or null when either is unusable. */
export function normalizeBookmarkInput(
  name: string,
  url: string,
): { name: string; url: string } | null {
  const trimmedName = name.trim();
  const normalizedUrl = normalizeBookmarkUrl(url);
  if (trimmedName.length === 0 || normalizedUrl === null) return null;
  return { name: trimmedName, url: normalizedUrl };
}

export interface BrowserBookmarksStoreState {
  readonly bookmarks: ReadonlyArray<Bookmark>;
  readonly addBookmark: (name: string, url: string) => string | null;
  readonly updateBookmark: (id: string, name: string, url: string) => void;
  readonly removeBookmark: (id: string) => void;
}

export function createBrowserBookmarksStore(storage: Partial<StateStorage> | undefined) {
  return create<BrowserBookmarksStoreState>()(
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
        updateBookmark: (id, name, url) => {
          const normalized = normalizeBookmarkInput(name, url);
          if (!normalized) return;
          set((state) => ({
            bookmarks: state.bookmarks.map((bookmark) =>
              bookmark.id === id ? { ...bookmark, ...normalized } : bookmark,
            ),
          }));
        },
        removeBookmark: (id) =>
          set((state) => ({
            bookmarks: state.bookmarks.filter((bookmark) => bookmark.id !== id),
          })),
      }),
      {
        name: BOOKMARKS_STORAGE_KEY,
        storage: createJSONStorage(() => resolveStorage(storage)),
        partialize: (state) => ({ bookmarks: state.bookmarks }),
      },
    ),
  );
}

/** Bookmarks are personal and shared by every preview tab, thread and project. */
export const useBrowserBookmarksStore = createBrowserBookmarksStore(
  typeof window !== "undefined" ? window.localStorage : undefined,
);
