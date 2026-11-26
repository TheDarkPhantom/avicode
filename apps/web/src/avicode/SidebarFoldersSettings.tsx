import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { T, useGT } from "gt-react";
import { ArrowDownIcon, ArrowUpIcon, FolderIcon } from "lucide-react";

import { SettingResetButton, SettingsRow } from "~/components/settings/settingsLayout";
import { useSearchableSetting } from "~/components/settings/settingsSearch";
import { Button } from "~/components/ui/button";
import { Switch } from "~/components/ui/switch";
import { updateClientSettings, useClientSettings } from "~/hooks/useSettings";
import { sidebarFolderActions, useSidebarFoldersStore } from "./sidebarFolders";

const DEFAULT_SHOW_ATTENTION =
  DEFAULT_CLIENT_SETTINGS.aviCodeSidebarShowAttentionUnderCollapsedFolders;

export function SidebarFolderAttentionRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const showAttention = useClientSettings(
    (settings) => settings.aviCodeSidebarShowAttentionUnderCollapsedFolders,
  );
  return (
    <SettingsRow
      {...setting("avicode-sidebar-folder-attention")}
      devicePreference
      description={gt(
        "A collapsed folder still lists chats waiting on approval or input, a failed run, or a plan ready to act on. Off, it hides all of its chats.",
      )}
      resetAction={
        showAttention !== DEFAULT_SHOW_ATTENTION ? (
          <SettingResetButton
            ariaLabel={gt("Reset chats under collapsed folders to default")}
            onClick={() =>
              void updateClientSettings({
                aviCodeSidebarShowAttentionUnderCollapsedFolders: DEFAULT_SHOW_ATTENTION,
              })
            }
          />
        ) : null
      }
      control={
        <Switch
          checked={showAttention}
          onCheckedChange={(checked) =>
            void updateClientSettings({
              aviCodeSidebarShowAttentionUnderCollapsedFolders: Boolean(checked),
            })
          }
          aria-label={gt("Keep chats that need you visible under collapsed folders")}
        />
      }
    />
  );
}

/** Hiding a folder happens in the sidebar; this list is the only way to bring one back. */
export function SidebarFoldersRow() {
  const setting = useSearchableSetting();
  const gt = useGT();
  const folders = useSidebarFoldersStore((state) => state.folders);
  return (
    <SettingsRow
      {...setting("avicode-sidebar-folders")}
      devicePreference
      description={gt(
        "Folders group projects in the sidebar when Labs > Boring sidebar is on. Make one from a project's right-click menu, then drag folders to reorder them.",
      )}
    >
      {folders.length === 0 ? (
        <p className="pt-2 pb-2 text-xs text-muted-foreground">
          <T>No folders yet.</T>
        </p>
      ) : (
        <ol
          aria-label={gt("Sidebar folders, in sidebar order")}
          className="mt-3 mb-2 divide-y divide-border/60 rounded-lg border border-border/60"
        >
          {folders.map((folder, index) => (
            <li key={folder.id} className="flex min-w-0 items-center gap-2 py-1.5 ps-3 pe-1.5">
              <FolderIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{folder.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {folder.hidden
                  ? gt("Hidden")
                  : gt("{count, plural, one {{count} project} other {{count} projects}}", {
                      count: folder.projectKeys.length,
                    })}
              </span>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                disabled={index === 0}
                aria-label={gt("Move {name} up", { name: folder.name })}
                onClick={() => sidebarFolderActions.move(folder.id, index - 1)}
              >
                <ArrowUpIcon />
              </Button>
              <Button
                type="button"
                size="icon-xs"
                variant="ghost-muted"
                disabled={index === folders.length - 1}
                aria-label={gt("Move {name} down", { name: folder.name })}
                onClick={() => sidebarFolderActions.move(folder.id, index + 1)}
              >
                <ArrowDownIcon />
              </Button>
              <Switch
                checked={!folder.hidden}
                onCheckedChange={(checked) => sidebarFolderActions.setHidden(folder.id, !checked)}
                aria-label={gt("Show {name} in the sidebar", { name: folder.name })}
              />
            </li>
          ))}
        </ol>
      )}
    </SettingsRow>
  );
}
