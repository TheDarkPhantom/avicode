import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Globe, Play, RadioTower } from "lucide-react";
import { useMemo } from "react";

import { Button } from "~/components/ui/button";
import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "~/components/ui/empty";

import { groupLocalServers } from "./localServerAttribution";
import { PreviewBookmarksBar } from "./PreviewBookmarksBar";
import { PreviewLocalServerCard } from "./PreviewLocalServerCard";
import type { ConfiguredPreviewUrl } from "./previewEmptyStateLogic";
import { useDiscoveredLocalServers } from "./useDiscoveredLocalServers";

interface Props {
  environmentId: EnvironmentId;
  configuredUrls?: ReadonlyArray<ConfiguredPreviewUrl> | undefined;
  recentlySeenUrls?: ReadonlyArray<string> | undefined;
  /**
   * Avi Code addition: which thread and project this panel belongs to, so the
   * list can say which of these servers is the one you opened the browser for.
   */
  threadId?: ThreadId | null;
  projectRoot?: string | null;
  worktreePath?: string | null;
  /**
   * Avi Code addition: the project's primary action, so this panel can start the
   * dev server itself when the thread does not have one running yet.
   */
  startDevServerLabel?: string | null;
  onStartDevServer?: (() => void) | undefined;
  onOpenUrl: (url: string) => void;
  /**
   * Avi Code addition: opens a bookmark, normalizing it like a typed URL (the
   * discovered-server `onOpenUrl` path resolves local ports, not external URLs).
   */
  onOpenBookmarkUrl: (url: string) => void;
}

export function PreviewEmptyState({
  environmentId,
  configuredUrls,
  recentlySeenUrls,
  threadId = null,
  projectRoot = null,
  worktreePath = null,
  startDevServerLabel = null,
  onStartDevServer,
  onOpenUrl,
  onOpenBookmarkUrl,
}: Props) {
  const servers = useDiscoveredLocalServers({
    environmentId,
    configuredUrls,
    recentlySeenUrls,
  });

  const sections = useMemo(
    () => groupLocalServers(servers, { threadId, projectRoot, worktreePath }),
    [projectRoot, servers, threadId, worktreePath],
  );

  // Avi Code addition: always offer Start when the project has a primary action to
  // run, even if a server is already listed below. A running dev server (often for
  // another thread or repo) no longer suppresses starting your own.
  const canStart = onStartDevServer != null;

  const startButton = canStart ? (
    <Button size="sm" onClick={() => onStartDevServer?.()}>
      <Play className="size-4" />
      {startDevServerLabel ? `Start ${startDevServerLabel}` : "Start dev server"}
    </Button>
  ) : null;

  const content =
    servers.length === 0 ? (
      <Empty>
        <EmptyMedia variant="icon">
          <Globe className="size-4.5 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>No preview yet</EmptyTitle>
        <EmptyDescription>
          {/* Avi Code addition: the list is limited to servers this app started, so the
              old promise of every listening localhost port would be a lie. */}
          Type a URL above, or run a dev script. Servers you start here show up automatically.
        </EmptyDescription>
        {startButton}
      </Empty>
    ) : (
      <div className="flex h-full min-h-0 overflow-y-auto px-5 py-8">
        <div className="m-auto flex w-full max-w-xl flex-col gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <RadioTower className="size-4 shrink-0" />
            <h2 className="font-medium">Local servers</h2>
          </div>
          {startButton ? <div className="flex">{startButton}</div> : null}
          {sections.map((section) => (
            <div key={section.group} className="flex flex-col gap-1.5">
              {/* Only worth a heading once there is more than one group to tell apart. */}
              {sections.length > 1 ? (
                <h3 className="px-1 text-xs font-medium text-muted-foreground">{section.title}</h3>
              ) : null}
              <div className="flex flex-col divide-y divide-border/60 overflow-hidden rounded-xl border border-border/70 bg-background">
                {section.servers.map((server) => (
                  <PreviewLocalServerCard
                    key={`${server.host}:${server.port}`}
                    server={server}
                    onOpen={() => onOpenUrl(server.url)}
                  />
                ))}
              </div>
            </div>
          ))}
          <p className="px-1 text-xs text-muted-foreground">
            Select a listening port to open it in this browser tab.
          </p>
        </div>
      </div>
    );

  // Avi Code addition: the bookmarks bar sits above the empty-state content and
  // only exists here, so it shows exactly when no page is loaded.
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border/60 px-4 py-2">
        <PreviewBookmarksBar onOpen={onOpenBookmarkUrl} />
      </div>
      <div className="min-h-0 flex-1">{content}</div>
    </div>
  );
}
