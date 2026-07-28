# AviCode upstream synchronization

AviCode is an independent MIT-licensed fork of
[T3 Code](https://github.com/pingdotgg/t3code). Upstream changes enter AviCode
through reviewable merge commits. The synchronization automation never merges
its own pull request and never publishes an AviCode release.

## Remotes

An AviCode development clone uses:

```text
origin    https://github.com/TheDarkPhantom/avicode.git
upstream  https://github.com/pingdotgg/t3code.git
```

Configure or repair the upstream remote with:

```bash
git remote remove upstream 2>/dev/null || true
git remote add upstream https://github.com/pingdotgg/t3code.git
git fetch upstream main
```

`pingdotgg/t3code/main` is the authoritative upstream branch. AviCode uses
merge commits rather than rebasing so the incorporated upstream ancestry
remains auditable.

## Automated workflow

`.github/workflows/sync-upstream.yml` runs every Monday at 09:00 Asia/Manila
and can also be dispatched manually.

The workflow:

1. Fetches upstream `main`.
2. exits without creating a PR when the upstream commit is already in AviCode
   `main`;
3. creates `chore/upstream-sync-YYYY-MM-DD` from AviCode `main`;
4. merges upstream with `--no-ff`;
5. pushes the review branch and opens or updates an `upstream-sync` PR; and
6. leaves merging and releasing to a human.

When Git reports conflicts, the workflow aborts the merge, records the
conflicting paths in the job summary, and opens one
`upstream-sync-blocked` issue for that upstream SHA. It does not push an
unresolved branch and never modifies `main`.

## Customization ownership

`.avicode/upstream-guardrails.json` is the machine-readable registry for the
fork's customization boundaries:

| Owner | Responsibility |
| --- | --- |
| `AviCodeBranding` | Name, palette, typography, icons, About attribution, and visible copy |
| `AviCodeIdentity` | App ID, executable, protocol, data directories, update repository, and upstream workflow |
| `DocumentAttachments` | PDF/TXT/Markdown contracts, extraction, storage, provider normalization, and UI |
| `WindowTitleMetadata` | Repository/thread title behavior and its privacy preference |
| `ALFRED-CODE` | Sanitized AviCode session export and ALFRED correlation |

The synchronization boundary is active now. The other boundaries are marked
`planned` because their base AviCode implementations have not landed yet.
The PR that implements each base feature must change its registry entry to
`active`, list its canonical files and protected markers, and add its focused
tests. From that point, deleting or bypassing the feature fails the required
`AviCode boundaries` check.

This avoids claiming that an absent feature passed a regression test while
still making enforcement part of the feature's definition of done.

## Required verification

All PRs run the lightweight boundary checker:

```bash
npm run test:avicode
npm run check:avicode
```

Upstream-sync PRs additionally run:

- the repository's normal CI, including formatting, lint, typecheck, tests,
  desktop build, and release smoke checks;
- the desktop smoke test; and
- an unsigned Windows x64 packaging test using `--publish never`.

When the remaining boundaries become active, their focused tests must be
included in the normal CI or in `avicode-guardrails.yml`. ALFRED compatibility
is implemented and tested in the private `ALFRED-CODE` repository; AviCode
must use sanitized fixtures and must not copy ALFRED credentials into this
public repository.

## Manual synchronization

When automation is unavailable:

```bash
git switch main
git pull --ff-only origin main
git fetch upstream main
git switch -c chore/upstream-sync-YYYY-MM-DD
git merge --no-ff upstream/main
npm run test:avicode
npm run check:avicode
git push -u origin HEAD
gh pr create --base main --label upstream-sync
```

Resolve conflicts within the review branch. Do not rewrite upstream
migrations, delete AviCode migrations, or bypass required checks.

## Database compatibility

Upstream migrations retain their original order and contents. AviCode-specific
migrations are append-only and must never be renumbered. Every database change
must test upgrading:

- the latest AviCode database fixture; and
- a representative T3 database imported into AviCode.

No synchronization or release process automatically downgrades a database.

## Release separation

Synchronization and distribution are separate:

```text
T3 upstream merge
→ AviCode sync PR
→ review and required checks
→ AviCode main
→ manual build
→ optional AviCode release
```

The AviCode updater may only use `TheDarkPhantom/avicode`. Official T3
binaries are never installed as AviCode updates. During the personal-alpha
phase, packaging uses `--publish never`.

## Provenance

To see whether the current AviCode checkout contains the latest upstream
commit:

```bash
git fetch upstream main
git merge-base --is-ancestor upstream/main HEAD
```

Exit status `0` means the upstream tip is incorporated. Inspect the exact
common commit with:

```bash
git merge-base HEAD upstream/main
```

The eventual AviCode About/diagnostics implementation will display this
incorporated upstream commit while clearly identifying AviCode as an
independent fork.
