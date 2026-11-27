# Avi Code 2 plan

Avi Code 2 replaces Avi Code. It is a fresh fork of upstream T3 Code v0.1.12 (`9827aba4b4`) that
carries over only the Avi Code features upstream doesn't already have, and stays thin enough for
weekly upstream syncs to merge cleanly. It installs next to the old Avi Code as a separate app, and
the old app is retired once Avi Code 2 wins in daily use.

This file is the plan, the decisions and the status. `docs/REFORK_LEDGER.md` is the detailed
feature inventory behind it.

## Status

| Step | What                                                                 | State                           |
| ---- | -------------------------------------------------------------------- | ------------------------------- |
| 1    | Inventory every old fork feature against upstream                    | Done (`docs/REFORK_LEDGER.md`)  |
| 2    | Prove old history can carry over                                     | Done, works                     |
| 3    | Branches: freeze the old fork, make the re-fork `main`               | Done (PR #307)                  |
| 4    | Identity and CI: Avi Code 2 installs side by side, checks run again  | Done (#309 to #323, #334, #336) |
| 5    | Feature ports                                                        | In progress, 10 of 18 done      |
| 6    | One-time history import on first launch                              | Done                            |
| 7    | Restore `main` protection, turn the right workflows back on          | Done                            |
| 8    | Use Avi Code 2 daily next to the old app, then uninstall the old app | Last                            |

## Why re-fork

- The old fork last synced upstream on 2026-07-30. Upstream has since added about 10,000 commits and
  replaced its whole orchestration engine (V2), so upstream syncs could no longer merge and every
  upstream fix had to be rebuilt by hand.
- **Upstream already does about half of what the fork added**, often better: background work kept
  Waiting, side chats (`/btw`), edit and branch, steer vs queue, usage page, quota meters, themes,
  voice, worktree cleanup, attachments.
- **What's left to port is small**: 27 items, nearly all in fork-owned files.
- **History carries over**, which was the biggest risk (step 2).

## Decisions

Made 2026-11-25.

**Repo and branches**

- The re-fork is `main`. The old fork is frozen on `legacy/v1` (`ce6e1d2c75`, includes the 9.24
  cut) and gets no new versions.
- `main` moved through `git merge -s ours`, so old history stays reachable and nothing was
  force-pushed.

**App identity** (permanent, not a transition name)

|             | Old Avi Code             | Avi Code 2                                                       |
| ----------- | ------------------------ | ---------------------------------------------------------------- |
| Name        | Avi Code                 | Avi Code 2                                                       |
| appId       | `com.advisoravi.avicode` | `com.advisoravi.avicode2`                                        |
| Protocol    | `avicode://`             | `avicode2://`                                                    |
| Executable  | `AviCode.exe`            | `AviCode2.exe`                                                   |
| Data home   | `~/.avicode`             | `~/.avicode2`                                                    |
| CLI command | none                     | `avicode` (upstream's is `t3`, which would collide with T3 Code) |

**Releases and versions**

- Same repo, `TheDarkPhantom/avicode`.
- **No auto-updates.** New versions go out as installers sent by hand, as before. Avi Code 2's
  updater is turned off.
- Avi Code 2 releases are never marked GitHub "Latest". The old app's updater reads Latest, and
  `0.1.12` sorts above `0.0.31`, so a Latest release would make old installs pull Avi Code 2.
- Versions are `0.1.12-avicode.1`, with the counter restarting when the upstream version changes.
- Never push tags. Old upstream tags carry a release workflow with no repository guard.

**Upstream syncs**

- On request, not scheduled. Say "sync upstream" and an agent merges upstream `main` into a branch
  and opens a PR. No `UPSTREAM_SYNC_TOKEN` secret; the scheduled `Sync upstream` workflow is
  disabled in repo settings.
- Sync every few weeks at most. The thin-fork rules keep merges clean only while the gap stays
  small; a gap of months brings back cherry-picking.

**History import**

- One import from `~/.avicode` on first launch. No repeat "Import latest" button.
- Fork thread-reference context is mapped to upstream's `context_json` where the shapes match.
- The 12,904 per-repo usage rows are kept in a side table for the later per-repo usage port.
- Provider instances, keybindings, secrets, client settings and attachments are copied. Window and
  layout state are not.
- Lost on import (upstream has no place for it): which thread was branched from which, per-message
  reply styles.

**Upstream services**

- Telemetry off by default (upstream sends to `ingest.t3.codes`).
- Keep upstream's hourly remote model list; fork model additions layer on top.
- Hide T3 Connect, the hosted app and T3's relay. Tailscale and LAN keep working.
- Admin policy file and registry key repointed to Avi Code paths, so Avi Code 2 doesn't obey T3
  Code's admin policy.
- Keep the `avicode_desktop` Codex originator (ALFRED reads it).
- Copy says Avi Code 2. A build step renames "T3 Code" in web, desktop and server sources and
  rehashes the catalogs to match, so upstream's strings and catalogs merge untouched. The build
  step can't reach upstream's "T3" SVG wordmark, so its call sites use
  `apps/web/src/avicode/AviCodeBrand.tsx` instead.

**Features**

| Feature                                                                 | Decision                                |
| ----------------------------------------------------------------------- | --------------------------------------- |
| Ctrl+W closes the thread, Ctrl+Shift+T reopens the last archived thread | Ported (#331)                           |
| Colour themes (Oxblood, Midnight, Forest, Violet, Graphite)             | Ported as upstream theme data (#327)    |
| Notification sound picker, plan mode as default                         | Ported (#328, #325)                     |
| Per-repo and per-credential usage                                       | Ported (#332)                           |
| Named sidebar folders                                                   | Ported, Labs boring sidebar only (#333) |
| Flat "all threads by recent activity" list                              | Drop                                    |
| Reply styles per turn                                                   | Port later                              |
| Latest agent thought on sidebar rows                                    | Port later                              |
| Files panel create / rename / delete                                    | Port later                              |
| Codex plan review                                                       | Drop                                    |
| Offline outbox                                                          | Drop                                    |
| Preview split view, tab drag, background tabs                           | Drop                                    |
| Full-row status colour, jump to plan top                                | Drop                                    |

## Step 2 result: history carries over

Tested on a `VACUUM INTO` copy of the live database (9.1 GB, 1,684 threads, 163k messages). The live
file was opened read-only and never written.

- **It can't open as is.** Upstream's migrator only runs migration ids above the highest one
  recorded. The old fork recorded its own migrations at ids 35-43, so upstream would skip its own
  35-43 and fail at migration 050.
- **The fix** (`scripts/avicode/convert-legacy-db.mjs`): save and drop three columns upstream
  re-adds, and remove migration records above 34 (ids 1-34 match upstream by name).
- **Result:** upstream ran migrations 35-117 in about 25 seconds with no errors. Old threads (679 and
  17 messages) opened through upstream's V1 importer with titles, provider, model, worktree and
  messages intact.

## Step 3 result: branches and repo settings

- `main` = the re-fork (PR #307). `legacy/v1` = the frozen old fork.
- `main` requires four checks again: `Check`, `Test`, `Release Smoke` and `AviCode boundaries`.
  The old fork's desktop smoke and Windows package checks are gone; the manual `Avi Code release`
  workflow builds the installer instead. PRs required, conversations resolved, no force push.
- Unwanted upstream workflows are disabled in repo settings, not deleted, so upstream syncs don't
  conflict on them. Active: `CI`, `Avi Code guardrails`, `Avi Code release`, `Agent Context
  Budget` and `PR Size`. Upstream's `Release` and `Release desktop build` stay disabled.
- Branches from the old fork (open worktrees) no longer merge into `main`.

## Step 4: identity and CI

Done. Identity #312, CI #309, release workflow #315 (#317, #318), changelog page #311, guardrails
#320, settings page #321, telemetry and promotions #316, admin policy #323, rebranded copy #322 and
#334, Avi Code logo in place of the T3 wordmark #336, fork docs #310 and #313. The
`0.1.12-avicode.3` installer was installed and checked on 2026-11-27: no T3 Code name or logo left
in the app.

1. Shared identity module (`packages/shared/src/avicodeIdentity.ts`) wired into every place upstream
   hardcodes T3 Code. The full file list is in the ledger, section 4.
2. Data home `~/.avicode2`, userData folder `avicode2`.
3. appId, protocol, `AviCode2.exe`, own updater cache folder, `avicode` CLI command.
4. Brand assets and exporter, plus upstream's 192/512 web icons.
5. Avi Code 2 name, favicons and window title in the UI.
6. Release workflow: `.github/workflows/avicode-release.yml`, run by hand with a version. It builds
   the Windows installer on a GitHub Windows runner (local builds need Visual Studio Build Tools),
   uploads it as a run artifact, and with `publish` attaches it to a pre-release tagged
   `avicode2-v<version>`. The build has no update feed, so the updater is off.
7. CI on GitHub-hosted runners, with job names matching the six required checks.
8. Guardrails checker plus `check:avicode` and `test:avicode`.
9. In-app changelog page and `CHANGELOG.md` format, starting at `0.1.12-avicode.1`.
10. Window title with repo and thread (for ALFRED and time trackers), plus its privacy toggle.
    Done (#321): upstream's title already carries both names; the toggle is new.
11. Slim Avi Code settings page for the fork toggles. Done (#321).
12. Telemetry off, T3 Connect and hosted app hidden, admin policy repointed, translations
    rebranded.
13. Fork docs: `CLAUDE.md` and the Avi Code overrides in `AGENTS.md`, `docs/UPSTREAM_SYNC.md`
    rewritten for this model.

Required checks are back (see step 3). The fork releases through `Avi Code release`, not upstream's
`Release`.

## Step 5: feature ports

In order. Each is one PR with a changelog entry.

| #   | Feature                                                                   | Cost  |
| --- | ------------------------------------------------------------------------- | ----- |
| 1   | Quick-send chips. Done (#329)                                             | cheap |
| 2   | Start new chats in plan mode. Done (#325)                                 | cheap |
| 3   | Ctrl+W closes thread, Ctrl+Shift+T reopens archived. Done (#331)          | cheap |
| 4   | Mouse back/forward buttons, Alt+Left/Right                                | cheap |
| 5   | Colour themes as upstream theme data. Done (#327)                         | cheap |
| 6   | Preview bookmarks bar. Done (#326)                                        | cheap |
| 7   | Open project folder in the file manager from the sidebar. Done (#324)     | cheap |
| 8   | Notification sound picker. Done (#328)                                    | cheap |
| 9   | One git write operation at a time per repo                                | free  |
| 10  | Settings still load when one value is invalid                             | free  |
| 11  | Preview port list hides Windows services and noise                        | free  |
| 12  | Claude sign-in from Settings. Done (#330)                                 | cheap |
| 13  | Higher input cap (600k characters; upstream has 120k)                     | cheap |
| 14  | Dead-worktree and low-disk monitor                                        | free  |
| 15  | Projects collapsed by default, expand/collapse all (check upstream first) | cheap |
| 16  | Archived page sorting, Ctrl+K finds archived threads                      | cheap |
| 18  | Per-repo and per-credential usage. Done (#332)                            | cheap |
| 19  | Named sidebar folders on the boring sidebar. Done (#333)                  | large |

Later: reply styles, latest thought on sidebar rows, Files panel create/rename/delete.

## Step 6: history import

Built in `apps/server/src/persistence/avicode/legacyAviCodeImport.ts`, called once from
`Sqlite.ts` before upstream's V2 database setup. On Avi Code 2's first start with the default data
home (never dev or `--base-dir` homes):

1. Snapshot `~/.avicode/userdata/state.sqlite` with `VACUUM INTO` from a read-only connection into
   `~/.avicode2/userdata/statev2.sqlite`. The source is never written.
2. Check that migration records 1 to 34 match upstream by name, then delete the old fork's records
   above 34. Every column stays: upstream's migrations check for existing columns, and the fork-only
   data (lineage, reply styles, thread context, per-repo usage) stays in place for later ports.
3. Copy `settings.json` (provider instances), `client-settings.json`, `keybindings.json`,
   `secrets` and `attachments` if absent. `environment-id` and window state are not copied.
4. Write `avicode-legacy-import.json` so it never runs again, then let upstream migrate and import
   threads lazily.

Tested against a 9.1 GB copy: 1,684 threads imported in 50 seconds, upstream migrations in 23,
old threads open with messages, provider and worktree intact, and the source checksum unchanged.

## Rules that keep the fork thin

- Prefer new files to edits. Edits to upstream files stay at single call sites, marked "Avi Code
  addition".
- Fork settings live in their own settings page and use distinct key names.
- **Fork database changes never go in `effect_sql_migrations`.** Upstream's migrator skips every id
  at or below the highest recorded one, so any fork id there eventually hides an upstream
  migration. Fork schema changes use a separate `avicode_migrations` table, run once after
  upstream's migrations from one call site.
- Disable unwanted upstream workflows in repo settings instead of deleting them.
- Before porting an optimization, check the problem still exists on V2. If not, drop it.

## Verification

- Per PR: `vp test run <files>`, `vp lint <path>`, targeted typecheck. CI gates once restored.
- Installer built on CI, installed next to the old app. Confirm `~/.avicode/userdata` is untouched
  (size and modified time before and after).
- Integrated pass in the desktop app: a Claude turn with a background task, a subagent and an
  attachment, then `/changelog`.
- Import: run against a database copy and spot-check threads, messages, settled and snoozed state.
- Worktree cleanup: only `git worktree remove`. Never recursive deletes near `~/.avicode` (junctions).
