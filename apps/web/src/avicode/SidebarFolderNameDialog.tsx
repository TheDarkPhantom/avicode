import { T, useGT } from "gt-react";
import { useId, useState } from "react";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { sidebarFolderActions } from "./sidebarFolders";
import {
  closeSidebarFolderNameDialog,
  type SidebarFolderNameRequest,
  useSidebarFolderNameDialogStore,
} from "./sidebarFolderNameDialogStore";

const FOLDER_NAME_MAX_CHARS = 80;

/** Names a new sidebar folder or renames one. Mounted once, beside the sidebar. */
export function SidebarFolderNameDialog() {
  const open = useSidebarFolderNameDialogStore((state) => state.open);
  const request = useSidebarFolderNameDialogStore((state) => state.request);
  const requestId = useSidebarFolderNameDialogStore((state) => state.requestId);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) closeSidebarFolderNameDialog();
      }}
    >
      <DialogPopup className="max-w-md">
        {request === null ? null : <FolderNameForm key={requestId} request={request} />}
      </DialogPopup>
    </Dialog>
  );
}

function FolderNameForm(props: { readonly request: SidebarFolderNameRequest }) {
  const gt = useGT();
  const formId = useId();
  const { request } = props;
  const [name, setName] = useState(request.kind === "rename" ? request.name : "");
  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    if (request.kind === "rename") sidebarFolderActions.rename(request.folderId, name);
    else sidebarFolderActions.create(name, request.projectKeys);
    closeSidebarFolderNameDialog();
  };
  return (
    <>
      <DialogHeader>
        <DialogTitle>
          {request.kind === "rename" ? gt("Rename folder") : gt("New folder")}
        </DialogTitle>
        {request.kind === "create" && request.projectName !== undefined ? (
          <DialogDescription>
            {gt("Create a folder and move {project} into it.", { project: request.projectName })}
          </DialogDescription>
        ) : null}
      </DialogHeader>
      <DialogPanel>
        <form
          id={formId}
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <Input
            nativeInput
            autoFocus
            value={name}
            maxLength={FOLDER_NAME_MAX_CHARS}
            placeholder={gt("Folder name")}
            aria-label={gt("Folder name")}
            onChange={(event) => setName(event.target.value)}
          />
        </form>
      </DialogPanel>
      <DialogFooter variant="bare">
        <Button variant="outline" onClick={closeSidebarFolderNameDialog}>
          <T>Cancel</T>
        </Button>
        <Button type="submit" form={formId} disabled={!canSave}>
          {request.kind === "rename" ? <T>Rename</T> : <T>Create folder</T>}
        </Button>
      </DialogFooter>
    </>
  );
}
