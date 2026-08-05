import { GitMergeIcon } from "lucide-react";
import type { MouseEvent as ReactMouseEvent } from "react";

import type { ScopedThreadRef } from "@t3tools/contracts";

import type { SidebarProjectSnapshot } from "../../sidebarProjectGrouping";
import { useThreadShellsForProjectRefs } from "../../state/entities";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { useProjectMergeRun } from "./useProjectMergeRun";

/**
 * Avi Code addition: the control that merges a project's ready worktree threads
 * one at a time.
 *
 * Upstream only merges a thread from its own chat header, so landing a stack of
 * finished work means visiting every thread in turn and guessing the order.
 * This runs them oldest first and stops at the first failure.
 *
 * The hooks live inside the component so both sidebars can drop it into a row
 * unconditionally: rendering nothing is the "no auto merge policy, or nothing
 * ready" case, which keeps the thread-shell subscription out of the parent.
 */
export function ProjectMergeRunButton({
  project,
  navigateToThread,
  onActivate,
  className,
}: {
  readonly project: SidebarProjectSnapshot;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => void;
  /** Called before the run starts, so a host menu can close itself. */
  readonly onActivate?: () => void;
  readonly className?: string;
}) {
  const threads = useThreadShellsForProjectRefs(project.memberProjectRefs);
  const mergeRun = useProjectMergeRun({
    environmentId: project.environmentId,
    projectCwd: project.workspaceRoot,
    threads,
    navigateToThread,
  });

  if (!mergeRun.hasAutoMergePolicy || mergeRun.candidateCount === 0) return null;

  const handleClick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onActivate?.();
    void mergeRun.run();
  };

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label={`Merge ready threads in ${project.displayName}`}
            data-testid="project-merge-run-button"
            disabled={mergeRun.isRunning}
            className={className}
            // The V2 call site sits inside a menu radio item, which would
            // otherwise claim the press and switch project scope instead.
            onPointerDown={(event) => event.stopPropagation()}
            onClick={handleClick}
          />
        }
      >
        <GitMergeIcon className={`size-3.5 ${mergeRun.isRunning ? "animate-status-pulse" : ""}`} />
      </TooltipTrigger>
      <TooltipPopup side="top">
        {mergeRun.isRunning
          ? "Merging ready threads..."
          : `Merge ${mergeRun.candidateCount} ready ${
              mergeRun.candidateCount === 1 ? "thread" : "threads"
            }`}
      </TooltipPopup>
    </Tooltip>
  );
}
