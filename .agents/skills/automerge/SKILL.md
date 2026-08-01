---
name: automerge
description: Land the current branch's pull request on main safely, handling a branch that has gone conflicted or stale before arming auto-merge, then watching it to a terminal state and syncing local main. Use when Avi says "automerge", "merge it", "ship it", or asks to turn on auto-merge for a PR.
---

# Automerge

GitHub's auto-merge only fires on a PR that is already mergeable. When main moves underneath the
branch, the PR goes conflicted, auto-merge silently stops acting on it, and the `pull_request`
workflows stop re-running. None of that surfaces as an error, so the PR reads as "waiting for
checks" indefinitely while nothing is happening.

This skill closes that gap: make the branch mergeable first, then arm auto-merge, then watch it to
a terminal state and report which one.

Never skip to step 3. Arming auto-merge on a conflicted branch is the exact no-op that caused this
skill to exist.

## 1. Read the real state

```bash
gh pr view <n> --json state,mergeStateStatus,mergeable,headRefOid,autoMergeRequest
git rev-parse HEAD          # must equal headRefOid, or you are reading a different commit
```

`mergeStateStatus` is the field that decides what happens next:

| Status | Meaning | Do |
| --- | --- | --- |
| `DIRTY` (with `mergeable: CONFLICTING`) | Real conflict with main | Step 2 |
| `BEHIND` | Stale but clean | Step 2, the rebase resolves it |
| `BLOCKED` | Mergeable, waiting on required checks | Step 3 |
| `CLEAN` / `HAS_HOOKS` | Ready | Step 3 |
| `UNSTABLE` | A non-required check failed | Read it before arming anything |

`mergeable` is computed asynchronously. `UNKNOWN` means GitHub has not finished working it out, so
re-read rather than treating it as clean.

## 2. Make it mergeable

```bash
git fetch origin
git rebase origin/main
```

Rebase rather than merge: `AGENTS.md` requires branches be rebased onto latest main before landing,
and a merge commit inside a feature branch muddies the merge-commit history this fork keeps.

**Resolving conflicts.** Resolve only mechanical ones. Where two changes genuinely disagree about
behaviour, that is Avi's call: stop, say what conflicts and with what, and wait.

`CHANGELOG.md` is the routine one and is nearly always a false conflict. Every PR appends a bullet
to the top of the same `## Unreleased` list, so both sides added distinct lines in the same place.
Keep every entry, ordered newest-first by PR number. Never drop the other side's line to clear the
marker.

Re-verify before pushing. A rebase replays your commits onto code you have not run them against:

```bash
vp test run <tests covering your change> apps/web/src/changelog/parseChangelog.test.ts
git push --force-with-lease
```

Use `--force-with-lease`, never `--force`. It refuses when the remote moved since your last fetch,
which is the difference between rewriting your own work and destroying someone else's.

## 3. Arm auto-merge

```bash
gh pr merge <n> --merge --auto --delete-branch
```

`--merge`, never `--squash`. Every PR in this fork has landed as a merge commit and the history
stays consistent. `--delete-branch` is required because the repo has `delete_branch_on_merge: false`,
so nothing else cleans branches up.

If auto-merge is already armed, confirm the method reads `MERGE` and carry on. Re-arming is
harmless.

## 4. Watch it to a terminal state

Two traps here, both of which produce a confident wrong answer:

**Do not poll for "nothing pending" straight after a push.** For the first minute only the fast
labeling jobs (`PR Size`, `PR Vouch`) have registered. Nothing is pending, so the loop exits and
reports green while `Test` has not started. Wait for the heavy jobs to appear first.

**Cover failure, not just success.** Exit on a failed required check too, or a red build looks
identical to a slow one.

The required jobs are `Test`, `Check`, `Release Smoke`, and `AviCode boundaries`. `Test` is the slow
one, at roughly seven minutes.

```bash
until [ "$(gh pr view <n> --json state --jq .state)" = "MERGED" ] \
   || gh pr checks <n> 2>&1 | grep -qE "^(Test|Check|Release Smoke|AviCode boundaries)\s+fail"; do
  sleep 30
done
gh pr view <n> --json state,mergeCommit
gh pr checks <n>
```

Run that with `run_in_background: true` rather than blocking on it.

**If a check fails**, read the actual failure before changing anything:

```bash
gh run view --job <job-id> --log-failed
```

Fix it, push, and return to step 4. Do not re-run a job hoping it was flaky unless it is one of the
known-flaky tests named in `CLAUDE.md`, and say so explicitly when you do.

## 5. Sync local

The merge landing on the remote does not update the local checkout, and `git checkout main` aborts
on a dirty tree, which leaves local main quietly stale while the PR reads as merged.

```bash
git checkout main && git pull --ff-only
git rev-parse main origin/main    # must agree
git branch -d <branch>            # -d, not -D: it refuses when something is unmerged
git remote prune origin
```

## Report

Say which terminal state was reached and give the merge commit. Then say anything that happened on
the way that Avi did not ask for: a conflict you resolved, a test you had to update, a check that
failed first. A merge that needed a rebase is a different event from one that did not, and the
difference is worth a sentence.
