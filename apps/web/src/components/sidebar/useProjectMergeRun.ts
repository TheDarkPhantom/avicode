import { scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentId, ScopedThreadRef } from "@t3tools/contracts";
import { AsyncResult } from "effect/unstable/reactivity";
import { useCallback, useMemo, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { randomUUID } from "~/lib/utils";

import { useT3ProjectFileAutoMerge } from "../../hooks/useT3ProjectFileScripts";
import { appAtomRegistry } from "../../rpc/atomRegistry";
import { vcsActionManager } from "../../state/vcs";
import type { SidebarThreadSummary } from "../../types";
import { firstValidTimestampMs, resolveSidebarV2Status } from "../Sidebar.logic";
import {
  resolveMergeRunCandidates,
  summarizeMergeRun,
  type MergeRunThreadInput,
} from "./projectMergeRun.logic";

/**
 * Avi Code addition. Merges a project's ready worktree threads one at a time.
 * Upstream merges each thread by hand from its own chat header; this walks them.
 *
 * Sequential on purpose — see `projectMergeRun.logic.ts`. The run stops at the
 * first failure and opens that thread, because a conflict there usually means
 * every branch behind it needs rebasing too.
 */
export function useProjectMergeRun(input: {
  readonly environmentId: EnvironmentId;
  readonly projectCwd: string | null;
  readonly threads: ReadonlyArray<SidebarThreadSummary>;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => void;
}) {
  const { environmentId, projectCwd, threads, navigateToThread } = input;
  const autoMergePolicy = useT3ProjectFileAutoMerge(environmentId, projectCwd);
  const [isRunning, setIsRunning] = useState(false);

  const plan = useMemo(
    () =>
      resolveMergeRunCandidates(
        threads.map(
          (thread): MergeRunThreadInput => ({
            threadKey: `${thread.environmentId}:${thread.id}`,
            title: thread.title,
            branch: thread.branch,
            worktreePath: thread.worktreePath,
            status: resolveSidebarV2Status(thread),
            updatedAtMs: firstValidTimestampMs(thread.updatedAt, thread.createdAt),
          }),
        ),
      ),
    [threads],
  );

  const threadByKey = useMemo(
    () => new Map(threads.map((thread) => [`${thread.environmentId}:${thread.id}`, thread])),
    [threads],
  );

  const run = useCallback(async () => {
    if (autoMergePolicy === null || plan.candidates.length === 0 || isRunning) {
      return;
    }
    const promotionRefs = [...(autoMergePolicy.promotionRefs ?? ["main"])];
    const targetRef = promotionRefs[promotionRefs.length - 1] ?? "main";
    const skippedBusy = plan.skipped.filter((entry) => entry.reason === "busy").length;
    const total = plan.candidates.length;
    const progressToastId = toastManager.add({
      type: "loading",
      title: `Merging ${total} ${total === 1 ? "thread" : "threads"} into ${targetRef}`,
      description: "Waiting for Git...",
      timeout: 0,
    });

    setIsRunning(true);
    let merged = 0;
    try {
      for (const candidate of plan.candidates) {
        toastManager.update(progressToastId, {
          type: "loading",
          title: `Merging ${merged + 1} of ${total} into ${targetRef}`,
          description: candidate.title,
          timeout: 0,
        });

        const result = await vcsActionManager
          .runStackedAction({ environmentId, cwd: candidate.worktreePath })
          .run(appAtomRegistry, {
            actionId: randomUUID(),
            action: "auto_merge",
            autoMerge: {
              promotionRefs,
              requireFinalApproval: autoMergePolicy.requireMainApproval ?? false,
            },
          });

        if (AsyncResult.isSuccess(result)) {
          merged += 1;
          continue;
        }

        // Stop rather than continue: later branches were cut before this one
        // landed, so merging them next stacks conflicts instead of clearing
        // them.
        toastManager.update(progressToastId, {
          type: "error",
          title: "Merge run stopped",
          description: summarizeMergeRun({
            merged,
            total,
            skippedBusy,
            failedTitle: candidate.title,
          }),
          timeout: 0,
        });
        const failedThread = threadByKey.get(candidate.threadKey);
        if (failedThread) {
          navigateToThread(scopeThreadRef(failedThread.environmentId, failedThread.id));
        }
        return;
      }

      toastManager.update(progressToastId, {
        type: "success",
        title: `Merged into ${targetRef}`,
        description: summarizeMergeRun({ merged, total, skippedBusy, failedTitle: null }),
      });
    } finally {
      setIsRunning(false);
    }
  }, [
    autoMergePolicy,
    environmentId,
    isRunning,
    navigateToThread,
    plan.candidates,
    plan.skipped,
    threadByKey,
  ]);

  return {
    candidateCount: plan.candidates.length,
    hasAutoMergePolicy: autoMergePolicy !== null,
    isRunning,
    run,
  };
}
