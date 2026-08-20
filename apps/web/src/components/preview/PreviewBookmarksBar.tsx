import { Bookmark as BookmarkIcon, Globe2, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "~/components/ui/menu";
import { faviconUrlForOrigin } from "~/lib/favicon";
import { cn } from "~/lib/utils";

import { type Bookmark, useBrowserBookmarksStore } from "~/browserBookmarksStore";

type EditingState =
  | { readonly mode: "add" }
  | { readonly mode: "edit"; readonly id: string }
  | null;

function BookmarkFavicon({ url }: { url: string }) {
  const faviconUrl = faviconUrlForOrigin(url, 32);
  const [failed, setFailed] = useState(false);
  if (!faviconUrl || failed) return <Globe2 className="size-3.5 shrink-0 text-muted-foreground" />;
  return (
    <img
      src={faviconUrl}
      alt=""
      aria-hidden
      draggable={false}
      className="size-3.5 shrink-0 rounded-sm"
      onError={() => setFailed(true)}
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
  const [name, setName] = useState(initial.name);
  const [url, setUrl] = useState(initial.url);
  const canSave = name.trim().length > 0 && url.trim().length > 0;
  return (
    <form
      className="flex flex-wrap items-center gap-2 rounded-lg border border-border/70 bg-background p-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSave) onSubmit(name, url);
      }}
    >
      <Input
        autoFocus
        aria-label="Bookmark name"
        placeholder="Name"
        value={name}
        onChange={(event) => setName(event.target.value)}
        className="h-8 w-40"
      />
      <Input
        aria-label="Bookmark URL"
        placeholder="example.com"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        className="h-8 w-64"
      />
      <Button type="submit" size="sm" disabled={!canSave}>
        Save
      </Button>
      <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
        Cancel
      </Button>
    </form>
  );
}

function BookmarkChip({
  bookmark,
  onOpen,
  onRename,
  onRemove,
}: {
  bookmark: Bookmark;
  onOpen: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="group flex items-center rounded-md hover:bg-accent/60">
      <button
        type="button"
        onClick={onOpen}
        title={bookmark.url}
        className="flex min-w-0 max-w-48 items-center gap-1.5 rounded-md py-1 pl-2 pr-1 text-sm text-foreground"
      >
        <BookmarkFavicon url={bookmark.url} />
        <span className="truncate">{bookmark.name}</span>
      </button>
      <Menu>
        <MenuTrigger
          className="mr-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground opacity-0 hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
          aria-label={`Actions for ${bookmark.name}`}
        >
          <MoreHorizontal className="size-3.5" />
        </MenuTrigger>
        <MenuPopup align="start" side="bottom" sideOffset={4} className="min-w-32">
          <MenuItem onClick={onRename}>Rename</MenuItem>
          <MenuItem onClick={onRemove}>Remove</MenuItem>
        </MenuPopup>
      </Menu>
    </div>
  );
}

/**
 * Avi Code addition: bookmarks bar for the in-app browser, shown on the preview
 * empty state. Bookmarks are global (see `browserBookmarksStore`); opening one
 * navigates the current tab through the same path as typing a URL.
 */
export function PreviewBookmarksBar({ onOpen }: { onOpen: (url: string) => void }) {
  const bookmarks = useBrowserBookmarksStore((state) => state.bookmarks);
  const addBookmark = useBrowserBookmarksStore((state) => state.addBookmark);
  const renameBookmark = useBrowserBookmarksStore((state) => state.renameBookmark);
  const editBookmarkUrl = useBrowserBookmarksStore((state) => state.editBookmarkUrl);
  const removeBookmark = useBrowserBookmarksStore((state) => state.removeBookmark);
  const [editing, setEditing] = useState<EditingState>(null);

  const editingBookmark =
    editing?.mode === "edit" ? bookmarks.find((entry) => entry.id === editing.id) : undefined;

  return (
    <div className="flex w-full flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <BookmarkIcon className="size-3.5" />
          Bookmarks
        </span>
        {bookmarks.map((bookmark) => (
          <BookmarkChip
            key={bookmark.id}
            bookmark={bookmark}
            onOpen={() => onOpen(bookmark.url)}
            onRename={() => setEditing({ mode: "edit", id: bookmark.id })}
            onRemove={() => {
              removeBookmark(bookmark.id);
              setEditing((current) =>
                current?.mode === "edit" && current.id === bookmark.id ? null : current,
              );
            }}
          />
        ))}
        <button
          type="button"
          aria-label="Add bookmark"
          title="Add bookmark"
          onClick={() => setEditing({ mode: "add" })}
          className={cn(
            "inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            editing?.mode === "add" && "bg-accent text-foreground",
          )}
        >
          <Plus className="size-4" />
        </button>
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
          initial={{ name: editingBookmark.name, url: editingBookmark.url }}
          onCancel={() => setEditing(null)}
          onSubmit={(name, url) => {
            renameBookmark(editingBookmark.id, name);
            editBookmarkUrl(editingBookmark.id, url);
            setEditing(null);
          }}
        />
      ) : null}
    </div>
  );
}
