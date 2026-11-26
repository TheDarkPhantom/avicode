import { create } from "zustand";

export type SidebarFolderNameRequest =
  | {
      readonly kind: "create";
      /** The project to move into the new folder, if any. */
      readonly projectKeys?: readonly string[];
      readonly projectName?: string;
    }
  | { readonly kind: "rename"; readonly folderId: string; readonly name: string };

// The request outlives `open`, so the dialog keeps its text while it animates closed.
export const useSidebarFolderNameDialogStore = create<{
  readonly open: boolean;
  readonly request: SidebarFolderNameRequest | null;
  readonly requestId: number;
}>(() => ({ open: false, request: null, requestId: 0 }));

export function openSidebarFolderNameDialog(request: SidebarFolderNameRequest): void {
  useSidebarFolderNameDialogStore.setState((state) => ({
    open: true,
    request,
    requestId: state.requestId + 1,
  }));
}

export function closeSidebarFolderNameDialog(): void {
  useSidebarFolderNameDialogStore.setState({ open: false });
}
