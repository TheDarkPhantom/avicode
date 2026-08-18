import { useMemo, useState } from "react";
import { SearchIcon, SquarePenIcon } from "lucide-react";

import type { useNewThreadHandler } from "../../hooks/useHandleNewThread";
import type {
  SidebarProjectGroupMember,
  SidebarProjectSnapshot,
} from "../../sidebarProjectGrouping";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import {
  Combobox,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxPopup,
  ComboboxTrigger,
} from "../ui/combobox";
import { useCreateThreadInProject } from "./SidebarFlatThreadList";

/** Avi Code addition: the flat sidebar's "New thread" button. There is no
 * project header to hang the button off, so it asks which project first. This
 * replaces the old native context menu with a searchable combobox; the single-
 * project case skips the picker and creates immediately. */

const TRIGGER_CLASS_NAME =
  "inline-flex h-6 min-w-6 cursor-pointer items-center justify-center rounded-md px-[calc(--spacing(1)-1px)] text-muted-foreground/60 transition-colors hover:bg-accent hover:text-foreground";

function memberLabel(member: SidebarProjectGroupMember): string {
  return member.environmentLabel ? `${member.title} — ${member.environmentLabel}` : member.title;
}

export function FlatNewThreadButton({
  projects,
  handleNewThread,
  newThreadShortcutLabel,
}: {
  projects: readonly SidebarProjectSnapshot[];
  handleNewThread: ReturnType<typeof useNewThreadHandler>;
  newThreadShortcutLabel: string | null;
}) {
  const createInProject = useCreateThreadInProject(handleNewThread);
  const members = useMemo(() => projects.flatMap((project) => project.memberProjects), [projects]);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const tooltipLabel = newThreadShortcutLabel
    ? `New thread (${newThreadShortcutLabel})`
    : "New thread";

  const memberKeys = useMemo(() => members.map((member) => member.physicalProjectKey), [members]);
  const filteredKeys = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle.length === 0) return memberKeys;
    return members
      .filter((member) => memberLabel(member).toLowerCase().includes(needle))
      .map((member) => member.physicalProjectKey);
  }, [members, memberKeys, query]);

  // No project header means no project to create in; fall through to a disabled
  // button. The single-project case skips the picker entirely.
  if (members.length <= 1) {
    const only = members[0];
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              aria-label="New thread"
              data-testid="flat-new-thread-button"
              className={TRIGGER_CLASS_NAME}
              disabled={!only}
              onClick={() => {
                if (only) createInProject(only);
              }}
            />
          }
        >
          <SquarePenIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">{tooltipLabel}</TooltipPopup>
      </Tooltip>
    );
  }

  return (
    <Combobox
      items={memberKeys}
      filteredItems={filteredKeys}
      value={null}
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
      onValueChange={(value) => {
        if (typeof value !== "string") return;
        const target = members.find((member) => member.physicalProjectKey === value);
        if (target) createInProject(target);
        setOpen(false);
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <ComboboxTrigger
              aria-label="New thread"
              data-testid="flat-new-thread-button"
              className={TRIGGER_CLASS_NAME}
            />
          }
        >
          <SquarePenIcon className="size-3.5" />
        </TooltipTrigger>
        <TooltipPopup side="right">{tooltipLabel}</TooltipPopup>
      </Tooltip>
      <ComboboxPopup align="start" className="w-64">
        <div className="px-2 pt-2">
          <div className="relative border-b border-border/70 pb-1.5 transition-colors focus-within:border-ring">
            <SearchIcon
              aria-hidden="true"
              className="pointer-events-none absolute top-1.5 left-0 size-4 shrink-0 text-muted-foreground/55"
            />
            <ComboboxInput
              className="[&_input]:h-6.5 [&_input]:ps-5 [&_input]:font-sans [&_input]:leading-6.5"
              inputClassName="rounded-none bg-transparent text-sm"
              placeholder="Search projects..."
              showTrigger={false}
              size="sm"
              unstyled
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        <ComboboxEmpty>No projects found.</ComboboxEmpty>
        <ComboboxList className="max-h-72 min-w-0">
          {members.map((member) => (
            <ComboboxItem
              key={member.physicalProjectKey}
              value={member.physicalProjectKey}
              contentClassName="flex min-w-0 items-center gap-2"
            >
              <ProjectFavicon
                environmentId={member.environmentId}
                cwd={member.workspaceRoot}
                className="size-4 shrink-0"
              />
              <span className="min-w-0 truncate">{memberLabel(member)}</span>
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxPopup>
    </Combobox>
  );
}
