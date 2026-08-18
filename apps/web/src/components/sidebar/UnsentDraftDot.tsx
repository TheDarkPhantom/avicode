import { useProjectHasUnsentDraft, useThreadHasUnsentDraft } from "../../unsentDraftIndicator";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";

/**
 * Avi Code addition: the marker a project wears while it holds composer text
 * that was never sent.
 *
 * A draft only becomes a thread on the first send, so before that it appears
 * nowhere in the sidebar — a half-written prompt is invisible until you happen
 * to click back into the project. This puts it on the project itself.
 *
 * The hook lives inside the component so both sidebars can drop it into a row
 * unconditionally: rendering nothing is the no-draft case, which keeps the
 * subscription out of every project row's own render.
 *
 * A static dot rather than anything animated — the sidebar can hold dozens of
 * these, and a repainting indicator costs GPU forever for something that never
 * changes. Amber is the sidebar's existing "waiting on you" colour; an unsent
 * draft is not an error.
 */
export function ProjectUnsentDraftDot({
  logicalProjectKey,
  projectName,
}: {
  readonly logicalProjectKey: string;
  readonly projectName: string;
}) {
  const hasUnsentDraft = useProjectHasUnsentDraft(logicalProjectKey);
  if (!hasUnsentDraft) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-testid="project-unsent-draft-dot"
            aria-label={`Unsent draft in ${projectName}`}
            className="size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-300/90"
          />
        }
      />
      <TooltipPopup side="top">Unsent draft</TooltipPopup>
    </Tooltip>
  );
}

/**
 * Avi Code addition: the same marker for an existing thread row.
 *
 * A message typed into an open thread and left unsent is invisible once you
 * navigate away — the row shows the thread's title, not that you have words
 * waiting in its composer. This puts the marker on the thread itself, mirroring
 * the project dot above. The hook lives inside the component so both sidebars
 * can drop it into a row unconditionally.
 */
export function ThreadUnsentDraftDot({
  threadKey,
  threadTitle,
}: {
  readonly threadKey: string;
  readonly threadTitle: string;
}) {
  const hasUnsentDraft = useThreadHasUnsentDraft(threadKey);
  if (!hasUnsentDraft) return null;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            data-testid="thread-unsent-draft-dot"
            aria-label={`Unsent draft in ${threadTitle}`}
            className="size-1.5 shrink-0 rounded-full bg-amber-500 dark:bg-amber-300/90"
          />
        }
      />
      <TooltipPopup side="top">Unsent draft</TooltipPopup>
    </Tooltip>
  );
}
