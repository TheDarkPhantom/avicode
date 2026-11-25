# Upstream sync

Avi Code 2 merges upstream T3 Code (`pingdotgg/t3code` `main`) every week through a reviewed pull
request. Since the re-fork, these merges are ordinary merges again: the fork stays thin, so most
weeks merge without conflicts. Automation prepares the PR; a human merges it. Nothing here builds or
publishes a release.

## Remotes

```text
origin    https://github.com/TheDarkPhantom/avicode.git
upstream  https://github.com/pingdotgg/t3code.git
```

Never push to `upstream`, and never push tags to `origin`. Old upstream tags carry a release
workflow with no repository guard, so fetch upstream with `--no-tags` and push branch refs only.

## The weekly workflow

`.github/workflows/sync-upstream.yml` runs every Monday at 09:00 Asia/Manila and can be run by hand
from the Actions tab. It:

1. Fetches upstream `main` without tags, and stops if that commit is already in `main`.
2. Creates `chore/upstream-sync-YYYY-MM-DD` from `main` and merges upstream with `--no-ff`.
3. Pushes that branch and opens or updates a PR labelled `upstream-sync`.
4. On conflicts, pushes nothing and opens (or comments on) one `upstream-sync-blocked` issue per
   upstream commit, listing the conflicting paths.

It never merges the PR and never touches `main`.

**Token.** The default `GITHUB_TOKEN` cannot push a merge that changes upstream's workflow files,
and PRs it opens don't start CI. Add a fine-grained personal access token for this repo as the
`UPSTREAM_SYNC_TOKEN` secret (Contents, Pull requests, Issues and Workflows: read and write) and the
workflow uses it. Without it, close and reopen the sync PR to start checks.

## Reviewing a sync PR

- Required checks are green.
- Fork-owned files still work, and every edit to an upstream file is still a single call site marked
  "Avi Code addition".
- Merge with `gh pr merge --merge --delete-branch`. Never squash: the merge commit is what records
  which upstream commit `main` contains.

## Keeping merges clean

- **Disable, don't delete, unwanted upstream workflows.** Mobile, relay, preview, release and
  unguarded scheduled workflows are turned off in repo settings
  (`gh workflow disable <name> -R TheDarkPhantom/avicode`). Deleting the file would conflict every
  time upstream edits it. A new upstream workflow starts enabled, so check each sync for new files in
  `.github/workflows/` and disable the unwanted ones.
- **Fork database changes live in `avicode_migrations`, never `effect_sql_migrations`.** Upstream's
  migrator skips every id at or below the highest recorded one, so a fork id there would eventually
  hide an upstream migration. With a separate ledger, upstream's migrations merge untouched and run
  in their own order.
- **Prefer new files to edits.** Conflicts only happen where the fork edits upstream files, so keep
  those edits to single call sites.

## Resolving a blocked sync by hand

```bash
git switch main
git pull --ff-only origin main
git fetch --no-tags upstream main
git switch -c chore/upstream-sync-YYYY-MM-DD
git merge --no-ff upstream/main
# resolve, then stage only the files you resolved
git push -u origin HEAD
gh pr create --base main --label upstream-sync
```

Resolve in favour of upstream unless the fork change is deliberate. Never rewrite or renumber an
upstream migration. Close the `upstream-sync-blocked` issue once the PR merges.

## Which upstream commit is in main

```bash
git fetch --no-tags upstream main
git merge-base --is-ancestor upstream/main origin/main && echo "up to date"
git merge-base origin/main upstream/main
```
