// Avi Code addition: warns when dead worktrees pile up or disk runs low. The
// background monitor pushes a snapshot over the server config stream; when it is
// breached this shows a warning toast with a "Clean up" action that opens the
// existing cleanup dialog. Dismissals are remembered so it does not re-pop on
// every check (see worktreeHealthDismissal).
import { useAtomValue } from "@effect/atom-react";
import { HardDriveIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { readProject, useProjectRefs } from "../state/entities";
import { primaryServerWorktreeHealthAtom } from "../state/server";
import { useWorktreeHealthDismissal } from "../worktreeHealthDismissal";
import {
  shouldShowWorktreeHealthToast,
  worktreeHealthToastCopy,
} from "./WorktreeHealthNotification.logic";
import {
  WorktreeCleanupDialog,
  type WorktreeCleanupTarget,
} from "./settings/WorktreeCleanupDialog";
import { stackedThreadToast, toastManager } from "./ui/toast";

type WorktreeHealthToastId = ReturnType<typeof toastManager.add>;

// Survives remounts (StrictMode double-invoke, route changes) so one snapshot is
// never prompted twice.
const seenCheckedAtKeys = new Set<string>();

export function WorktreeHealthNotification() {
  const snapshot = useAtomValue(primaryServerWorktreeHealthAtom);
  const { dismissal, recordDismissal } = useWorktreeHealthDismissal();
  const [dialogOpen, setDialogOpen] = useState(false);
  const activeToastRef = useRef<WorktreeHealthToastId | null>(null);

  const projectRefs = useProjectRefs();
  const targets: ReadonlyArray<WorktreeCleanupTarget> = projectRefs.flatMap((ref) => {
    const project = readProject(ref);
    if (!project) {
      return [];
    }
    return [
      {
        environmentId: project.environmentId,
        projectId: project.id,
        cwd: project.workspaceRoot,
        title: project.title,
      },
    ];
  });

  useEffect(() => {
    return () => {
      if (activeToastRef.current !== null) {
        toastManager.close(activeToastRef.current);
        activeToastRef.current = null;
      }
    };
  }, []);

  const recordCurrentDismissal = useCallback(() => {
    if (!snapshot) {
      return;
    }
    recordDismissal({
      dismissedAt: new Date().toISOString(),
      deadCleanCount: snapshot.deadCleanCount,
      freeBytes: snapshot.freeBytes,
    });
  }, [recordDismissal, snapshot]);

  useEffect(() => {
    if (!shouldShowWorktreeHealthToast({ snapshot, dismissal, nowMs: Date.now() })) {
      return;
    }
    if (snapshot === null || activeToastRef.current !== null) {
      return;
    }
    if (seenCheckedAtKeys.has(snapshot.checkedAt)) {
      return;
    }
    seenCheckedAtKeys.add(snapshot.checkedAt);

    const copy = worktreeHealthToastCopy(snapshot);
    const toastId = toastManager.add(
      stackedThreadToast({
        type: "warning",
        title: copy.title,
        description: copy.description,
        timeout: 0,
        actionProps: {
          children: "Clean up",
          onClick: () => {
            if (activeToastRef.current !== null) {
              toastManager.close(activeToastRef.current);
              activeToastRef.current = null;
            }
            setDialogOpen(true);
          },
        },
        actionVariant: "default",
        data: {
          hideCopyButton: true,
          leadingIcon: <HardDriveIcon aria-hidden="true" className="size-4 text-warning" />,
          onClose: () => {
            recordCurrentDismissal();
            activeToastRef.current = null;
          },
        },
      }),
    );
    activeToastRef.current = toastId;
  }, [snapshot, dismissal, recordCurrentDismissal]);

  return <WorktreeCleanupDialog open={dialogOpen} onOpenChange={setDialogOpen} targets={targets} />;
}
