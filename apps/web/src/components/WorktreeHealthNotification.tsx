// Avi Code addition: warns when dead worktrees pile up or disk runs low. The
// background monitor pushes a snapshot over the server config stream; when it is
// breached this shows a warning toast with a "Clean up" action that starts the
// background cleanup scan. Dismissals are remembered so it does not re-pop on
// every check (see worktreeHealthDismissal).
import { useAtomValue } from "@effect/atom-react";
import { HardDriveIcon } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

import { useProjectRefs } from "../state/entities";
import { primaryServerWorktreeHealthAtom } from "../state/server";
import { useWorktreeHealthDismissal } from "../worktreeHealthDismissal";
import {
  shouldShowWorktreeHealthToast,
  worktreeHealthToastCopy,
} from "./WorktreeHealthNotification.logic";
import { cleanupTargetsForProjects, startWorktreeCleanupScan } from "../worktreeCleanupJob";
import { stackedThreadToast, toastManager } from "./ui/toast";

type WorktreeHealthToastId = ReturnType<typeof toastManager.add>;

// Survives remounts (StrictMode double-invoke, route changes) so one snapshot is
// never prompted twice.
const seenCheckedAtKeys = new Set<string>();

export function WorktreeHealthNotification() {
  const snapshot = useAtomValue(primaryServerWorktreeHealthAtom);
  const { dismissal, recordDismissal } = useWorktreeHealthDismissal();
  const activeToastRef = useRef<WorktreeHealthToastId | null>(null);

  const projectRefs = useProjectRefs();
  const projectRefsRef = useRef(projectRefs);
  projectRefsRef.current = projectRefs;

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
            startWorktreeCleanupScan(cleanupTargetsForProjects(projectRefsRef.current));
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

  return null;
}
