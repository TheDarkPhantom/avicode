import { scopedThreadKey, scopeThreadRef } from "@t3tools/client-runtime/environment";
import type { EnvironmentThreadShell } from "@t3tools/client-runtime/state/models";
import { presentThreadShell } from "@t3tools/client-runtime/state/shell";
import { sortSettledThreads } from "@t3tools/client-runtime/state/thread-sort";
import type { OlderSettledScope } from "@t3tools/client-runtime/state/threads";
import type { EnvironmentId } from "@t3tools/contracts";
import { useNavigate } from "@tanstack/react-router";
import { ArchiveIcon, ArchiveRestoreIcon, CircleCheckIcon } from "lucide-react";
import { useGT } from "gt-react";
import { useState } from "react";

import { RelativeTime } from "../components/RelativeTime";
import { filterSidebarV2VisibleThreads } from "../components/Sidebar.logic";
import { Button } from "../components/ui/button";
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemDetail,
  MenuItemLabel,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "../components/ui/menu";
import { Spinner } from "../components/ui/spinner";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../components/ui/tooltip";
import {
  refreshArchivedThreadsForEnvironment,
  useArchivedThreadSnapshots,
} from "../lib/archivedThreadsState";
import type { SidebarProjectSnapshot } from "../sidebarProjectGrouping";
import { useDelegatedUnderParent, useThreadShellsForProjectRefs } from "../state/entities";
import { useOlderSettledShelf, useOlderSettledShelfGrowth } from "../state/olderSettledShelf";
import { buildThreadRouteParams } from "../threadRoutes";
import { useUnarchiveAndOpenThread } from "./useUnarchiveAndOpenThread";

const PAGE_SIZE = 10;

type Members = SidebarProjectSnapshot["memberProjects"];

function memberEnvironmentIds(members: Members): EnvironmentId[] {
  return [...new Set(members.map((member) => member.environmentId))];
}

/**
 * A project folder's archive button in the boring sidebar: lists the project's settled threads,
 * which open, and its archived threads, which unarchive and open.
 */
export function ProjectArchivedThreadsMenu(props: {
  readonly group: SidebarProjectSnapshot;
  readonly actionFor: string;
}) {
  const gt = useGT();
  const { group } = props;
  return (
    <Menu
      onOpenChange={(open) => {
        if (!open) return;
        for (const environmentId of memberEnvironmentIds(group.memberProjects)) {
          refreshArchivedThreadsForEnvironment(environmentId);
        }
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <MenuTrigger
              render={
                <Button
                  data-sidebar-action-for={props.actionFor}
                  data-testid="project-archived-threads-button"
                  size="icon-xs"
                  variant="ghost-muted"
                  aria-label={gt("Settled and archived threads in {project}", {
                    project: group.displayName,
                  })}
                />
              }
            />
          }
        >
          <ArchiveIcon aria-hidden />
        </TooltipTrigger>
        <TooltipPopup>{gt("Settled and archived threads")}</TooltipPopup>
      </Tooltip>
      {/* The popup unmounts while closed, so the lists load only when opened. */}
      <MenuPopup side="right" align="start" className="w-80">
        <ProjectArchivedThreadsMenuContent
          members={group.memberProjects}
          refs={group.memberProjectRefs}
        />
      </MenuPopup>
    </Menu>
  );
}

function ProjectArchivedThreadsMenuContent(props: {
  readonly members: Members;
  readonly refs: SidebarProjectSnapshot["memberProjectRefs"];
}) {
  const gt = useGT();
  const navigate = useNavigate();
  const unarchiveAndOpen = useUnarchiveAndOpenThread();
  const [settledShown, setSettledShown] = useState(PAGE_SIZE);
  const [archivedShown, setArchivedShown] = useState(PAGE_SIZE);
  const environmentIds = memberEnvironmentIds(props.members);

  const shells = filterSidebarV2VisibleThreads(
    useThreadShellsForProjectRefs(props.refs),
    null,
    useDelegatedUnderParent(),
  );
  const scopes: OlderSettledScope[] = environmentIds.map((environmentId) => ({
    environmentId,
    projectIds: props.members.flatMap((member) =>
      member.environmentId === environmentId ? [member.id] : [],
    ),
  }));
  const olderSettled = useOlderSettledShelf({
    scopes,
    expanded: true,
    visibleCount: settledShown,
  });
  const settled = sortSettledThreads(
    shells.filter((thread) => thread.settledOverride === "settled"),
  ).filter(olderSettled.isListed);
  useOlderSettledShelfGrowth(olderSettled, settled);
  const settledTotal = settled.length + olderSettled.unloadedCount(shells);

  const archive = useArchivedThreadSnapshots(environmentIds);
  const memberKeys = new Set(props.members.map((member) => `${member.environmentId}:${member.id}`));
  const archived = archive.snapshots
    .flatMap(({ environmentId, snapshot }) =>
      snapshot.threads.flatMap((thread) =>
        memberKeys.has(`${environmentId}:${thread.projectId}`)
          ? [presentThreadShell(environmentId, thread)]
          : [],
      ),
    )
    .toSorted((left, right) =>
      (right.archivedAt ?? right.createdAt).localeCompare(left.archivedAt ?? left.createdAt),
    );

  const threadKey = (thread: EnvironmentThreadShell) =>
    scopedThreadKey(scopeThreadRef(thread.environmentId, thread.id));

  return (
    <>
      <MenuGroup>
        <MenuGroupLabel>{gt("Settled", { $context: "sidebar section" })}</MenuGroupLabel>
        {settled.slice(0, settledShown).map((thread) => (
          <MenuItem
            key={threadKey(thread)}
            onClick={() => {
              void navigate({
                to: "/$environmentId/$threadId",
                params: buildThreadRouteParams(scopeThreadRef(thread.environmentId, thread.id)),
              });
            }}
          >
            <CircleCheckIcon aria-hidden />
            <MenuItemLabel className="flex-1">{thread.title}</MenuItemLabel>
            <MenuItemDetail>
              <RelativeTime timestamp={thread.settledAt ?? thread.updatedAt} />
            </MenuItemDetail>
          </MenuItem>
        ))}
        {olderSettled.loading && settled.length < settledShown ? (
          <MenuItem disabled>
            <Spinner aria-hidden size="sm" tone="muted" />
            <MenuItemLabel>{gt("Loading…")}</MenuItemLabel>
          </MenuItem>
        ) : settledTotal === 0 ? (
          <MenuItem disabled>
            <MenuItemLabel>{gt("No settled threads")}</MenuItemLabel>
          </MenuItem>
        ) : null}
        {settledTotal > settledShown ? (
          <MenuItem
            closeOnClick={false}
            onClick={() => setSettledShown((count) => count + PAGE_SIZE)}
          >
            <MenuItemLabel>
              {gt("Show more settled ({count} more)", { count: settledTotal - settledShown })}
            </MenuItemLabel>
          </MenuItem>
        ) : null}
      </MenuGroup>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel>{gt("Archived", { $context: "sidebar section" })}</MenuGroupLabel>
        {archived.slice(0, archivedShown).map((thread) => (
          <MenuItem
            key={threadKey(thread)}
            onClick={() => {
              void unarchiveAndOpen(scopeThreadRef(thread.environmentId, thread.id));
            }}
          >
            <ArchiveRestoreIcon aria-hidden />
            <MenuItemLabel className="flex-1">{thread.title}</MenuItemLabel>
            <MenuItemDetail>
              <RelativeTime timestamp={thread.archivedAt ?? thread.createdAt} />
            </MenuItemDetail>
          </MenuItem>
        ))}
        {archived.length === 0 ? (
          <MenuItem disabled>
            {archive.isLoading ? <Spinner aria-hidden size="sm" tone="muted" /> : null}
            <MenuItemLabel>
              {archive.isLoading
                ? gt("Loading…")
                : archive.error
                  ? gt("Could not load archived threads")
                  : gt("No archived threads")}
            </MenuItemLabel>
          </MenuItem>
        ) : null}
        {archived.length > archivedShown ? (
          <MenuItem
            closeOnClick={false}
            onClick={() => setArchivedShown((count) => count + PAGE_SIZE)}
          >
            <MenuItemLabel>
              {gt("Show more archived ({count} more)", { count: archived.length - archivedShown })}
            </MenuItemLabel>
          </MenuItem>
        ) : null}
      </MenuGroup>
    </>
  );
}
