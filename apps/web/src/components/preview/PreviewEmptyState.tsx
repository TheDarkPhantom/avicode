import type { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { Globe, RadioTower } from "lucide-react";
import { useMemo } from "react";

import { Empty, EmptyDescription, EmptyMedia, EmptyTitle } from "~/components/ui/empty";

import { groupLocalServers } from "./localServerAttribution";
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
  onOpenUrl: (url: string) => void;
}

export function PreviewEmptyState({
  environmentId,
  configuredUrls,
  recentlySeenUrls,
  threadId = null,
  projectRoot = null,
  worktreePath = null,
  onOpenUrl,
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

  if (servers.length === 0) {
    return (
      <Empty>
        <EmptyMedia variant="icon">
          <Globe className="size-4.5 text-muted-foreground" />
        </EmptyMedia>
        <EmptyTitle>No preview yet</EmptyTitle>
        <EmptyDescription>
          Type a URL above, or run a dev script. Listening localhost ports will show up here
          automatically.
        </EmptyDescription>
      </Empty>
    );
  }

  return (
    <div className="flex h-full min-h-0 overflow-y-auto px-5 py-8">
      <div className="m-auto flex w-full max-w-xl flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RadioTower className="size-4 shrink-0" />
          <h2 className="font-medium">Local servers</h2>
        </div>
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
}
