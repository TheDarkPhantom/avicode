import type { ScopedThreadRef } from "@t3tools/contracts";
import { T, useGT } from "gt-react";
import { Bookmark as BookmarkIcon, Globe2, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { useFaviconForThreadUrl } from "~/browserFaviconStore";
import { FaviconImage } from "~/components/preview/PreviewFaviconIcon";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";

import {
  type Bookmark,
  normalizeBookmarkInput,
  useBrowserBookmarksStore,
} from "./browserBookmarksStore";

type Editing = { readonly mode: "add" } | { readonly mode: "edit"; readonly id: string } | null;

function BookmarkFavicon({ threadRef, url }: { threadRef: ScopedThreadRef; url: string }) {
  const source = useFaviconForThreadUrl(threadRef, url);
  return (
    <FaviconImage
      sources={[source]}
      fallback={<Globe2 className="size-3.5 text-muted-foreground" />}
      className="size-3.5 shrink-0 rounded-sm object-contain"
    />
  );
}

function BookmarkForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: { name: string; url: string };
  onSubmit: (name: string, url: string) => void;
  onCancel: () => void;
}) {
  const gt = useGT();
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const canSave = normalizeBookmarkInput(name, url) !== null;
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSubmit(name, url);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onCancel();
      }}
    >
      <Input
        autoFocus
        size="sm"
        aria-label={gt("Bookmark name")}
        placeholder={gt("Name", { $context: "bookmark name field" })}
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="w-40"
      />
      <Input
        size="sm"
        aria-label={gt("Bookmark URL")}
        placeholder="example.com"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="w-64"
      />
      <Button type="submit" size="xs" disabled={!canSave}>
        <T>Save</T>
      </Button>
      <Button type="button" size="xs" variant="ghost" onClick={onCancel}>
        <T>Cancel</T>
      </Button>
    </form>
  );
}

function BookmarkChip({
  threadRef,
  bookmark,
  onOpen,
  onEdit,
  onRemove,
}: {
  threadRef: ScopedThreadRef;
  bookmark: Bookmark;
  onOpen: () => void;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const gt = useGT();
  return (
    <div className="group flex items-center">
      <Button
        type="button"
        variant="ghost"
        size="xs"
        title={bookmark.url}
        onClick={onOpen}
        className="max-w-48"
      >
        <BookmarkFavicon threadRef={threadRef} url={bookmark.url} />
        <span className="truncate">{bookmark.name}</span>
      </Button>
      <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 has-data-popup-open:opacity-100">
        <Menu>
          <MenuTrigger
            render={
              <Button
                type="button"
                variant="ghost-muted"
                size="icon-micro"
                aria-label={gt("Actions for {name}", { name: bookmark.name })}
              />
            }
          >
            <MoreHorizontal />
          </MenuTrigger>
          <MenuPopup align="start" sideOffset={4}>
            <MenuItem onClick={onEdit}>
              <T context="verb, edit a bookmark">Edit</T>
            </MenuItem>
            <MenuItem variant="destructive" onClick={onRemove}>
              <T context="verb, delete a bookmark">Remove</T>
            </MenuItem>
          </MenuPopup>
        </Menu>
      </div>
    </div>
  );
}

/** Global bookmarks on the preview's new-tab page; opening one loads it in this tab. */
export function PreviewBookmarksBar({
  threadRef,
  onOpenUrl,
}: {
  threadRef: ScopedThreadRef;
  onOpenUrl: (url: string) => void;
}) {
  const gt = useGT();
  const bookmarks = useBrowserBookmarksStore((state) => state.bookmarks);
  const addBookmark = useBrowserBookmarksStore((state) => state.addBookmark);
  const updateBookmark = useBrowserBookmarksStore((state) => state.updateBookmark);
  const removeBookmark = useBrowserBookmarksStore((state) => state.removeBookmark);
  const [editing, setEditing] = useState<Editing>(null);
  const editingBookmark =
    editing?.mode === "edit" ? bookmarks.find((entry) => entry.id === editing.id) : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <BookmarkIcon className="size-3.5" />
          <T>Bookmarks</T>
        </span>
        {bookmarks.map((bookmark) => (
          <BookmarkChip
            key={bookmark.id}
            threadRef={threadRef}
            bookmark={bookmark}
            onOpen={() => onOpenUrl(bookmark.url)}
            onEdit={() => setEditing({ mode: "edit", id: bookmark.id })}
            onRemove={() => removeBookmark(bookmark.id)}
          />
        ))}
        {bookmarks.length === 0 ? (
          <Button
            type="button"
            variant="ghost-muted"
            size="xs"
            onClick={() => setEditing({ mode: "add" })}
          >
            <Plus />
            <T>Add bookmark</T>
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost-muted"
            size="icon-xs"
            aria-label={gt("Add bookmark")}
            title={gt("Add bookmark")}
            onClick={() => setEditing({ mode: "add" })}
          >
            <Plus />
          </Button>
        )}
      </div>
      {editing?.mode === "add" ? (
        <BookmarkForm
          initial={{ name: "", url: "" }}
          onCancel={() => setEditing(null)}
          onSubmit={(name, url) => {
            addBookmark(name, url);
            setEditing(null);
          }}
        />
      ) : null}
      {editingBookmark ? (
        <BookmarkForm
          key={editingBookmark.id}
          initial={{ name: editingBookmark.name, url: editingBookmark.url }}
          onCancel={() => setEditing(null)}
          onSubmit={(name, url) => {
            updateBookmark(editingBookmark.id, name, url);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
