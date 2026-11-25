# Avi Code re-fork ledger

Avi Code is being rebuilt as Avi Code 2 on today's upstream T3 Code (started from upstream
`9827aba4b4`, v0.1.12). This ledger records every fork feature from `legacy/v1` and whether it
moves over. Decisions are in section 1.

Short version:

- About 125 fork features were checked: 62 UI, ~40 server, ~22 desktop/identity/CI.
- **Upstream already does about half of them**, often better (V2 orchestration, background work,
  side chats, forks, usage page, themes, voice, worktree cleanup, quota meters).
- **About 25 are real gaps worth porting**, mostly small and fork-owned.
- **Your history carries over.** A converted copy of your 9.1 GB database (1,684 threads, 163k
  messages) migrated cleanly through upstream's 117 migrations, and old threads open through
  upstream's V1 importer.

## 1. Decisions (made 2026-11-25)

**Repo, releases, identity**

- **Branch layout:** the re-fork becomes `main`. The old fork is frozen on `legacy/v1` and gets no
  new versions.
- **App identity (permanent, not a transition name):** name "Avi Code 2", appId
  `com.advisoravi.avicode2`, protocol `avicode2://`, executable `AviCode2.exe`, data home
  `~/.avicode2`, CLI command `avicode`. It installs next to the old Avi Code.
- **Releases:** same repo. Avi Code 2 releases must never become the GitHub "Latest" release the old
  app's updater reads (`allowPrerelease = false` on `latest`), and Avi Code 2's own updater reads
  them explicitly.
- **Versions:** `0.1.12-avicode.1`, counter restarts when the upstream version changes.

**History import**

- One-time import from `~/.avicode` on first launch. No repeat "Import latest".
- Map fork `thread_context_json` to upstream `context_json` where the shapes match. Keep the 12,904
  `provider_instance_usage` rows in a side table for the later per-repo usage port.
- Copy provider instances, keybindings, secrets, client settings and attachments. Skip window and
  layout state.

**Upstream services**

- Telemetry off by default.
- Keep upstream's hourly remote model list; fork model additions layer on top.
- Hide T3 Connect, hosted app and relay. Tailscale and LAN keep working.
- Repoint the admin policy file and registry key to Avi Code paths.
- Keep the `avicode_desktop` Codex originator.
- Rebrand all 10 translation files at the `i18n:generate` step.

**Features**

| Feature                                                     | Decision                               |
| ----------------------------------------------------------- | -------------------------------------- |
| Per-repo and per-credential usage                           | Port later (rows kept by the importer) |
| Sidebar folders / flat list                                 | Rebuild folders later; drop flat list  |
| Reply styles per turn                                       | Port later                             |
| Codex plan review                                           | Drop                                   |
| Latest agent thought on sidebar rows                        | Port later                             |
| Offline outbox                                              | Drop                                   |
| Preview split view, tab drag, background tabs               | Drop                                   |
| Files panel create / rename / delete                        | Port later                             |
| Colour themes (Oxblood, Midnight, Forest, Violet, Graphite) | Port as upstream theme data            |
| Ctrl+W closes thread, Ctrl+Shift+T reopens archived         | **Port the fork version**              |
| Notification sound picker, plan mode default                | Port (already on the list)             |
| Full-row status colour, jump to plan top                    | Drop                                   |

## 2. Port list, in order

Free means a fork-owned file with little coupling; cheap means one call site in upstream code.

**Identity first (needed to install Avi Code 2 side by side).**

| Feature                                                       | Cost                          | Notes                                                                         |
| ------------------------------------------------------------- | ----------------------------- | ----------------------------------------------------------------------------- |
| `avicodeIdentity.ts` plus every consumer                      | cheap module, many call sites | See section 4 for the full checklist                                          |
| Data home `~/.avicode2`, userData `avicode2`                  | cheap                         | Upstream `DesktopStatePaths.ts:19`, `DesktopUserData.ts:43-65`                |
| appId, protocol, executable `AviCode2.exe`, updater cache dir | cheap                         | `scripts/build-desktop-artifact.ts:66,2803,2970`, `ElectronProtocol.ts:16-17` |
| Brand assets and exporter                                     | cheap                         | Add upstream's new 192/512 web icons                                          |
| Renderer branding (`branding.ts`, favicons, title)            | cheap                         |                                                                               |
| Release repo pin and manual-only release workflow             | expensive                     | Upstream split release into `release.yml` + `release-desktop.yml`             |
| CI on GitHub-hosted runners                                   | cheap                         | Upstream uses `blacksmith-*` runners, so PR checks never start on the fork    |
| Guardrails checker, `check:avicode` / `test:avicode`          | cheap                         | Replace the deleted `test:desktop-smoke` step                                 |
| Changelog page and `CHANGELOG.md` format                      | free                          | Restart numbering at `0.1.12-avicode.1`                                       |
| Window title metadata and its privacy toggle                  | cheap                         | ALFRED and time trackers rely on it                                           |
| Slim Avi Code settings page                                   | cheap                         | New `_chat.settings.avicode.tsx`; most old rows map to upstream settings      |

**Then features.**

| Feature                                                         | Cost  | Notes                                                                             |
| --------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| Quick-send chips                                                | cheap | One mount point in upstream `ChatComposer`                                        |
| Start new chats in plan mode                                    | cheap | Upstream only defaults access mode                                                |
| Mouse back/forward buttons, Alt+Left/Right                      | cheap | Upstream has the navigation commands already                                      |
| Preview bookmarks bar                                           | cheap |                                                                                   |
| Open project folder in file manager (sidebar menu)              | cheap | Upstream has the reveal helper                                                    |
| Notification sound picker (5 sounds)                            | cheap | Extends upstream's fixed sound                                                    |
| Serialize git write workflows per repo (`RepositoryActionLock`) | free  | Upstream only caps git process count                                              |
| Settings survive one invalid value (`resilientClientSettings`)  | free  |                                                                                   |
| Preview port list hides Windows services and noise              | free  | Upstream ties servers to threads on Linux only                                    |
| Claude sign-in from Settings                                    | cheap | Re-home onto upstream's `provider.auth.*` framework, which has no Claude flow yet |
| Raised input caps (600k chars)                                  | cheap | Upstream caps at 120k chars, 100 files                                            |
| Dead-worktree and low-disk monitor                              | free  | Rewire onto upstream `storageCleanup`                                             |
| Projects collapsed by default, expand/collapse all              | cheap | Verify upstream lacks it first                                                    |
| Archived page sort, Ctrl+K finds archived threads               | cheap |                                                                                   |

Every optimization gets re-checked on V2 before porting. If the problem is gone, the fix is dropped.

## 3. Upstream wins or drop

Upstream has these, or V2 made them obsolete. Retest the ones marked _retest_ once Avi Code 2 runs.

- **Provider and orchestration:** background tasks keep a thread Waiting, stuck "running" after a
  crash, stop without an error, plan-mode write denial, question answers with attachments, plan
  follow-ups with images (_retest_), thread creation retry, connection supervisor, `/compact`,
  Claude tool-search pinning, model catalog (Fable 5.2, Opus 5.5, Sonnet 5.5), ChatGPT plan names.
- **Threads:** edit and branch (upstream `ThreadForkService`), thread references as context,
  `/btw` (upstream side chats, `/btw` alias kept), steer vs queue, settle/snooze/auto-settle, pin
  threads and projects, unsent-draft dot, Ctrl+1-9 jump hints, Ctrl+F thread search, Ctrl+Enter
  background send, thread status icons (full-row tint dropped).
- **Composer and UI:** quota meter, usage page, attachments (upstream allows 100 files, 50 MB, DOCX,
  XLSX, PPTX and more), model picker, conversation width, per-project overrides, sidebar search,
  provider badges, voice dictation (upstream: local plus cloud, no Deepgram), Claude resume
  compaction prompt, markdown fixes (_retest numbered lists_), scroll anchoring (_retest open at
  last answer_), plan card fixes, right-panel resizing.
- **Git and worktrees:** worktree cleanup with rules, restore a removed worktree, auto-merge waiting
  on checks, dev server auto-start for worktrees, open in Explorer, editor discovery off startup.
- **Desktop:** compile cache, GPU cache cleanup, NSIS installer (rebrand its process names), the
  centered scroll-gutter lint rule.
- **Copied-in upstream files:** 25 web files and 9 server files the fork had copied early. Upstream's
  copies are newer.

## 4. Identity checklist

Upstream hardcodes identity in many places since July. Each needs `AVICODE_IDENTITY`.

- **Name:** `apps/desktop/package.json:47`, `DesktopEnvironment.ts:88`, `apps/web/src/branding.ts`,
  `electron-launcher.mjs:16,271-272`, `DesktopCliShim.ts:13`, `DesktopHomeOwner.ts:99-132`,
  `ManagedProjectFolders.ts:202`, i18n JSONs.
- **appId:** `build-desktop-artifact.ts:66,2970`, `DesktopEnvironment.ts:231`,
  `DesktopEarlyElectronStartup.ts:34`, `electron-launcher.mjs:18-19`.
- **Protocol:** `ElectronProtocol.ts:16-17`, `electron-launcher.mjs:20`, build `protocols` block.
- **Data home:** `DesktopStatePaths.ts:19`, `os-jank.ts:255`, `cli/browser.ts:55`,
  `DesktopUserData.ts:43-65`, `DesktopWslEnvironment.ts:268-276`, `compileCache.ts:16`,
  `cliCompileCache.ts:16`.
- **CLI shim:** `DesktopCliShim.ts:139-145` writes `t3.cmd`; `addToPath` would put a second `t3` on
  PATH next to T3 Code's. Rename to `avicode`.
- **Background service:** `cloud/bootService.ts:61,65,316`, `serviceLauncher.ts:207`.
- **Update feed:** `build-desktop-artifact.ts:2731-2755` (no owner check), `DesktopStartupRecovery.ts:23`.
- **Repoint or turn off:** telemetry (`AnalyticsService.ts:71-77`), remote model manifest fetched
  hourly from `pingdotgg/t3code` (`ModelManifest.ts:29`), T3 Connect and hosted app URLs
  (`connectAuth.ts:10`, `cloud/publicConfig.ts`), install URLs, managed policy file and registry
  key (Avi Code 2 would obey T3 Code's admin policy), mobile app settings row.

## 5. Release and CI safety

- **The old app's updater reads the "Latest" release on this repo.** `0.1.12-avicode.1` sorts above
  `0.0.31-avicode.9.23`, so an Avi Code 2 release marked Latest would be downloaded by the old app
  (as a separate app, repeatedly). Avi Code 2 releases are therefore never marked Latest, and Avi
  Code 2's updater is configured to read them anyway.
- **Never push tags.** Old upstream tags (for example `v0.1.0`) carry a release workflow with no
  repository guard. Push explicit branch refs only.
- Upstream's workflows run on Blacksmith runners, which this repo doesn't have, so their jobs queue
  forever. Port CI to GitHub-hosted runners before relying on PR checks.
- `main` is protected and requires the checks `Check`, `Test`, `Release Smoke`, `AviCode
  boundaries`, `AviCode desktop smoke` and `AviCode Windows x64 package`. The ported CI must keep
  these names, or the protection rule must be updated in the same step.
- Unguarded upstream schedules (`pr-limits`, `stale-needs-more-info`) and mobile, relay and preview
  workflows get disabled in repo settings (`gh workflow disable`), not deleted, so upstream syncs
  don't conflict on them.

## 6. Data: importer, not a fresh start

Tested on a `VACUUM INTO` copy of `~/.avicode/userdata/state.sqlite`. The live file was opened
read-only and never written. The test server ran with provider CLIs removed from `PATH`.

**Why it can't open as is.** Upstream's migrator only runs ids above the highest recorded one. Your
DB records fork migrations at ids 35-42 (43 on newer builds), so upstream would skip its own
35-43 and fail at 050 on a missing `linked_pull_request_json`.

**What worked:**

1. Save `title_regeneration_*` and `auto_settle_disabled_at` per thread, then drop those three
   columns (upstream re-adds them under the same names).
2. Delete migration rows above 34. Ids 1-34 match upstream by name.
3. Start upstream on the copy. It made `statev2.sqlite`, ran migrations 35-117 in about 25 seconds
   with no errors, and listened.
4. `t3 thread show` opened a 679-message thread and a 17-message thread through
   `LegacyV1ThreadImporter`, with titles, provider instance, model, worktree and messages intact.

**What does not carry over** (upstream's importer ignores it): fork lineage, communication style,
`thread_context_json` (map to upstream's `context_json` if the shapes match), pending background
task ids, and `provider_instance_usage` (12,904 usage rows). Provider instances, keybindings and
secrets live in files and need copying alongside.

**Importer design:** on first launch, snapshot `~/.avicode/userdata/state.sqlite` with
`VACUUM INTO` into `~/.avicode2`, run the conversion above, copy settings, keybindings, secrets
and attachments, then let upstream's normal startup take over. The source is never written.
`scripts/avicode/convert-legacy-db.mjs` is the tested starting point.

## 7. Fork migrations from now on

Upstream's migrator skips any id at or below the highest recorded id. So any fork migration in
`effect_sql_migrations`, at any id, eventually hides a future upstream migration. **Fork schema
changes go in a separate fork-owned ledger table** (`avicode_migrations`), run once after upstream's
`runMigrations` from a single call site. Upstream's ids stay untouched and weekly syncs stay clean.

## 8. Branches

- `legacy/v1`: the frozen old fork (`ce6e1d2c75`). No new versions.
- `main`: becomes the re-fork, via a `git merge -s ours` of the old `main` so history is kept and
  nothing is force-pushed. Until then the re-fork lives on `next`.
