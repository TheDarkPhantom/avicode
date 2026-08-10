import type { ProjectId, ScopedThreadRef } from "@t3tools/contracts";
import { scopedThreadKey, scopeProjectRef } from "@t3tools/client-runtime/environment";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { Globe2Icon, PlayIcon } from "lucide-react";
import { useMemo } from "react";

import { useDiscoveredPorts } from "~/portDiscoveryState";
import { primaryProjectScript } from "~/projectScripts";
import { useDevServerStartIntent } from "~/devServerStartIntent";
import { useProject } from "~/state/entities";
import { previewEnvironment } from "~/state/preview";
import { useAtomCommand } from "~/state/use-atom-command";
import { useClientSettings } from "~/hooks/useSettings";

import { openDiscoveredPort } from "../preview/openDiscoveredPort";
import { findScopedDevServer } from "../preview/startDevServer.logic";
import { stackedThreadToast, toastManager } from "../ui/toast";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Avi Code addition: per-thread dev-server affordance for the sidebar.
 *
 * Opens the thread's dev server when one is already reachable, and otherwise
 * offers to start it by running the project's primary action. A worktree thread
 * only counts its own server; a local thread reuses any server the project has,
 * matching the preview panel's start button. Starting runs in ChatView (it owns
 * the terminal), so this navigates to the thread and leaves a start request.
 */
export function ThreadDevServerButton(props: {
  readonly threadRef: ScopedThreadRef;
  readonly projectId: ProjectId;
  readonly projectRoot: string | null;
  readonly worktreePath: string | null;
  readonly navigateToThread: (threadRef: ScopedThreadRef) => void;
}) {
  const { threadRef, projectId, projectRoot, worktreePath, navigateToThread } = props;
  const servers = useDiscoveredPorts(threadRef.environmentId);
  const existing = useMemo(
    () =>
      findScopedDevServer(servers, {
        threadId: threadRef.threadId,
        projectRoot,
        worktreePath,
      }),
    [servers, threadRef.threadId, projectRoot, worktreePath],
  );
  const project = useProject(
    useMemo(
      () => scopeProjectRef(threadRef.environmentId, projectId),
      [threadRef.environmentId, projectId],
    ),
  );
  const hasPrimaryScript = primaryProjectScript(project?.scripts ?? []) != null;
  const openPreview = useAtomCommand(previewEnvironment.open, { reportFailure: false });
  const requestStart = useDevServerStartIntent((state) => state.request);
  const alwaysShowStart = useClientSettings(
    (settings) => settings.aviCodeSidebarAlwaysShowDevServerStart,
  );

  if (existing) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label={`Open localhost:${existing.port}`}
              className="inline-flex cursor-pointer items-center justify-center text-emerald-600 outline-hidden focus-visible:ring-1 focus-visible:ring-ring dark:text-emerald-400"
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                navigateToThread(threadRef);
                void (async () => {
                  const result = await openDiscoveredPort({
                    threadRef,
                    port: existing,
                    openPreview,
                  });
                  if (result._tag === "Success" || isAtomCommandInterrupted(result)) return;
                  const error = squashAtomCommandFailure(result);
                  toastManager.add(
                    stackedThreadToast({
                      type: "error",
                      title: "Unable to open preview",
                      description:
                        error instanceof Error ? error.message : "The preview could not be opened.",
                    }),
                  );
                })();
              }}
            />
          }
        >
          <Globe2Icon className="size-3" />
        </TooltipTrigger>
        <TooltipPopup side="top">Open localhost:{existing.port}</TooltipPopup>
      </Tooltip>
    );
  }

  if (!hasPrimaryScript) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Start dev server"
            className={`inline-flex cursor-pointer items-center justify-center text-muted-foreground/60 outline-hidden transition-opacity hover:text-foreground focus-visible:pointer-events-auto focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring max-sm:pointer-events-auto max-sm:opacity-100 ${
              alwaysShowStart
                ? ""
                : "pointer-events-none opacity-0 group-hover/menu-sub-item:pointer-events-auto group-hover/menu-sub-item:opacity-100 group-focus-within/menu-sub-item:pointer-events-auto group-focus-within/menu-sub-item:opacity-100 group-hover/v2-row:pointer-events-auto group-hover/v2-row:opacity-100 group-focus-within/v2-row:pointer-events-auto group-focus-within/v2-row:opacity-100"
            }`}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              navigateToThread(threadRef);
              requestStart(scopedThreadKey(threadRef));
            }}
          />
        }
      >
        <PlayIcon className="size-3" />
      </TooltipTrigger>
      <TooltipPopup side="top">Start dev server</TooltipPopup>
    </Tooltip>
  );
}
