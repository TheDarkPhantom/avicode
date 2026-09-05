# Worktree cleanup

Every chat worktree is a full checkout of your repo, so weeks of use pile up duplicated
`node_modules`, stale branches, and per-turn checkpoint refs. Worktree cleanup finds the dead ones
and reclaims the disk they hold.

## What counts as dead

A worktree is offered for cleanup when it is one of:

- **Archived** — its thread is archived.
- **Settled** — its thread is marked settled.
- **PR merged or closed** — the worktree's branch has a merged or closed pull request.
- **Orphaned** — no live thread references it anymore (for example, the thread was deleted).

A worktree shared by more than one thread is only offered when every thread using it is dead. The
primary working tree is never touched, and only worktrees Avi Code created (under its managed
worktrees directory) are eligible.

## Scanning and deleting

1. Open **Settings -> Avi Code -> Worktree cleanup** and choose **Scan for dead worktrees** to sweep
   every project, or use a project's **Clean up dead worktrees** action to scan just that repo.
2. The preview lists each candidate grouped by repo, with its reason and the disk it would free, and
   a running total. Worktrees with uncommitted changes or an active session are listed but left
   unchecked; tick them only if you are sure.
3. Choose what to remove alongside the worktree directory: **delete branches**, **prune checkpoints**,
   and **run git gc** (all on by default). `git gc` repacks the repo so the freed objects actually
   leave disk.
4. **Delete selected** removes the checked worktrees. Nothing is deleted until you confirm.

The summary reports how much was reclaimed and lists any worktrees that could not be removed.
