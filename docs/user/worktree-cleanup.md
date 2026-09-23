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

## Automatic health checks

You do not have to remember to scan. Avi Code checks on its own about two minutes after it starts
and then once an hour. Each check counts the dead worktrees in every project and reads how much free
space is left on the drive that holds them.

A check "breaches" when either limit is crossed:

- **Too many dead worktrees** — the count of clean dead worktrees reaches the threshold (80 by
  default).
- **Low disk** — free space drops below the low-disk mark (20 GB by default; set it to 0 to turn the
  disk check off).

On a breach you get a warning with a **Clean up** button that opens the same review dialog. The
warning does not nag: once you dismiss it, it stays quiet for a day unless things get meaningfully
worse (more dead worktrees, or a lot less free space).

If **Remove clean dead worktrees automatically** is on (the default), a breached check also deletes
the clean dead worktree folders on the spot and tells you what it freed. Automatic removal only ever
deletes worktree directories. It never touches branches or checkpoints, never removes a worktree
with uncommitted changes or a running session, and leaves "PR closed without merge" worktrees for
you to remove by hand.

All of this lives under **Settings -> Avi Code -> Worktree cleanup**: the last check result, a
**Check now** button, the two thresholds, and the automatic-removal switch.
