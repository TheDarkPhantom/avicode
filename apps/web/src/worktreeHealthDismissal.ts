// Avi Code addition: remembers when the user dismissed a worktree-health warning
// so it does not re-pop every check. The stored count and free space let the
// toast re-appear when the situation gets meaningfully worse. Mirrors the shape
// of `providerUpdateDismissal.ts`.
import { useCallback } from "react";
import * as Schema from "effect/Schema";

import { useLocalStorage } from "./hooks/useLocalStorage";

export const WORKTREE_HEALTH_DISMISSAL_STORAGE_KEY = "avicode:worktree-health-dismissal:v1";

export const WorktreeHealthDismissalSchema = Schema.Struct({
  dismissedAt: Schema.String,
  deadCleanCount: Schema.Number,
  freeBytes: Schema.NullOr(Schema.Number),
});

export type WorktreeHealthDismissal = typeof WorktreeHealthDismissalSchema.Type;

export function useWorktreeHealthDismissal() {
  const [dismissal, setDismissal] = useLocalStorage(
    WORKTREE_HEALTH_DISMISSAL_STORAGE_KEY,
    null as WorktreeHealthDismissal | null,
    Schema.NullOr(WorktreeHealthDismissalSchema),
  );

  const recordDismissal = useCallback(
    (next: WorktreeHealthDismissal) => {
      setDismissal(next);
    },
    [setDismissal],
  );

  return { dismissal, recordDismissal };
}
