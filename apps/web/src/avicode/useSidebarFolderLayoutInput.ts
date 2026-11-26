import { useClientSettings } from "~/hooks/useSettings";
import { useUiStateStore } from "~/uiStateStore";
import type { SidebarFolderLayoutInput } from "./sidebarFolderLayout";
import { useSidebarFoldersStore } from "./sidebarFolders";

const NO_VISITS: Readonly<Record<string, string>> = {};

/** What `layoutSidebarFolders` needs from stores and settings. */
export function useSidebarFolderLayoutInput(input: {
  readonly routeThreadKey: string | null;
  readonly scoped: boolean;
  /** Folders only draw in the boring sidebar. */
  readonly active: boolean;
}): SidebarFolderLayoutInput {
  const folders = useSidebarFoldersStore((state) => state.folders);
  const showAttentionUnderCollapsed = useClientSettings(
    (settings) => settings.aviCodeSidebarShowAttentionUnderCollapsedFolders,
  );
  // Visits change on every navigation; only a collapsed folder reads them, so the sidebar
  // re-renders for them only then.
  const readsVisits =
    input.active && !input.scoped && folders.some((folder) => folder.collapsed && !folder.hidden);
  const localLastVisitedAtById = useUiStateStore((state) =>
    readsVisits ? state.threadLastVisitedAtById : NO_VISITS,
  );
  return {
    folders,
    showAttentionUnderCollapsed,
    localLastVisitedAtById,
    routeThreadKey: input.routeThreadKey,
    scoped: input.scoped,
  };
}
