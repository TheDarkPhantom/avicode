# FUTURE_ENHANCEMENTS — Avi Code

Open work and deferred decisions. Structure: **where things stand → what is open → what shipped**.

## Where things stand

Avi Code is a personal Windows alpha. Codex and Claude use existing CLI authentication.
ActivityWatch is authoritative for human time; sessions and GitHub only enrich attribution.

## Worth doing next

1. Use the alpha for real work and fix observed friction.
2. Add local, opt-in OCR for scanned PDFs.
3. Add a document preview drawer with page/heading navigation.
4. Add per-attachment inclusion controls for large extracted documents.
5. Expand diagnostics with Avi Code/upstream commits and ALFRED metadata status.

## Deferred

- Opening a chat at its last response is web/desktop only. Mobile's `ThreadFeed` has its own
  scroll machinery (`initialScrollAtEnd` plus bespoke end-space suppression) and reads none of the
  Avi Code settings, so the toggle silently does nothing there — the same boundary every other
  fork setting sits behind.
- Opening at the last response anchors the newest assistant message, not the start of the turn. A
  turn whose final answer is split across several assistant messages (commentary, tool work, then
  a short "Done") opens on that last fragment rather than the substantive one. Anchoring the whole
  turn instead would need the reserved end space the send anchor uses, which leaves scrollable
  blank space below a finished chat.
- The initial position is resolved once, on the first render with rows, and frozen for the chat's
  lifetime. A chat whose history streams in after the first non-empty batch (very long chats, slow
  links) anchors on whatever the newest response was at that moment.
- Queue-vs-steer for messages sent while a turn is running. Today the composer always steers: a
  send during a running turn is injected into that turn immediately (see the comment in
  `apps/web/src/components/ChatView.logic.ts`). There is no queue and no setting, and the
  `hasQueuedTurn` path in `ChatComposer.tsx` is the offline outbox for a disconnected environment,
  not this. Upstream built the feature — server-side per-thread queue, auto-drained on natural turn
  completion, with per-message Steer and Remove chips above the composer — in
  `pingdotgg/t3code#4245` (branch `t3code/queue-steer-feature`, fetched here as
  `origin/t3code/queue-steer-feature`). That PR was **closed unmerged** on 2026-07-30 in favour of
  orchestration V2 (`#2829`), which reportedly has the behaviour natively; the closing note invites
  a rebase-and-reopen if V2 turns out to be missing it. So do not merge the dead branch — its seven
  commits sit on a base that is now well over a hundred commits stale and it adds a colliding
  migration. Wait for the V2 merge tracked in `TODO.md`, then re-check whether the behaviour is
  present. If it is wanted sooner, the cheap fork-local version is a client-side hold while
  `phase === "running"` that flushes on turn completion, with an `aviCodeSendWhileRunning`
  setting on the Avi Code settings page — at the cost of a queue that does not survive a reload.
- The changelog is hand-written. Nothing derives it from git, so a PR that forgets its `Unreleased`
  line leaves no trace, and an upstream sync means pasting the merged commit list in by hand. A
  script that turns `git log --first-parent <base>..<sync>` into the **Upstream t3code** section
  would remove the tedious half; CI could then fail a PR whose diff touches `apps/` without touching
  `CHANGELOG.md`.
- Releases in the changelog are not tied to release artifacts: the version heading is written by
  hand at bump time rather than by the release workflow, so a published build and its changelog
  entry can drift.
- Sidebar pins are device-local. They persist in the browser's `t3code:ui-state:v1` blob, next to
  the manual project order, so they do not follow the user to another device or to the desktop
  app's settings file. Syncing would mean either moving them into `ClientSettingsSchema` or giving
  threads a server-side pin the way upstream did for settle/snooze.
- Pinning is a single-row action: the multi-select thread menu offers no "Pin (n)", and the command
  palette still lists projects in plain activity order.
- Communication styles are recorded per message by _label_, not by id. That keeps history honest
  when a custom style is renamed or deleted, but it means the timeline chip cannot link back to the
  style that produced it, and two styles that once shared a name are indistinguishable after the
  fact. Storing an id alongside the label would fix both at the cost of a second column.
- A style applies from the next message only. There is no "re-ask that turn in this style", which
  would need the original prompt re-sent rather than the transcript re-rendered.
- Plan-mode enforcement is Claude-only: the Claude adapter now hard-denies Edit/Write/NotebookEdit
  during plan turns, but Codex, Cursor, and OpenCode delegate plan behaviour to their runtimes and
  have not been verified to stop after proposing a plan. If a provider still auto-implements,
  consider interrupting the turn as soon as the plan is captured so it settles and the Implement
  button appears immediately.
- The start-in-plan-mode setting reads the client-settings snapshot through a callback registered
  by `hooks/useSettings` (module-cycle constraint), so a draft created before that module loads
  would fall back to build mode. Not observed in practice — any rendered UI loads the hook first.
- Colour themes do not reach three surfaces that are still hardcoded to a binary light/dark:
  the desktop native window chrome (`DesktopWindow.ts` — background `#0a0a0a`/`#ffffff` and the
  titlebar symbol colours), the Shiki/diff highlighting themes (`diffRendering.ts` is fixed to
  `pierre-light`/`pierre-dark`), and the decorative art in `index.css` (stage blueprint, glass
  shells, `--ultrathink-spectrum`), which stays oxblood-tuned under every palette.
- Colour theme selection is per-browser localStorage, so it does not sync across devices the way
  `ClientSettings` does. Moving it into `ClientSettingsSchema` needs a pre-paint story first —
  client settings hydrate asynchronously, which would repaint the app a frame after load.
- The Avi Code Shortcuts tab is component state, so it is not deep-linkable and resets when you
  leave the page. A search param would fix it, but `/settings/avicode` is a fork-owned route whose
  params upstream does not know about.
- The Shortcuts tab's "Built in" list is hand-maintained (`AviCodeShortcuts.logic.ts`) because those
  chords are wired into components rather than declared anywhere enumerable. It can drift from the
  code; each entry names its implementation file so the list can be re-checked.
- No cross-thread merge orchestration. `GitWorkflowService.runStackedAction` already takes a
  per-repository lock, so two threads running `auto_merge` at once queue instead of interleaving
  git phases — but nothing rebases the loser, so the second PR can still land stale or conflict.
  There is no merge queue, no "merge every ready PR in this project", and no way to nominate one
  thread as the integrator. A project-level action that walks the threads with an open PR, runs the
  existing `auto_merge` one at a time, and stops on the first conflict by opening that thread would
  be the smallest useful version.
- Sidebar v2's "Merging" label (`SidebarV2.tsx`) is both v2-only and mis-named: it fires while a
  source-control action is in flight (`prepare_pull_request_thread`, `create_pr`, `commit_push_pr`)
  and again once the PR is merged or closed, so a settled PR reads as still merging. Sidebar v1 has
  no equivalent, which is why the label is invisible to anyone on the default sidebar.
- Explorer drag progress and cancellation.
- DOCX, CSV, JSON, and source archives.
- Encrypted PDF password prompts without persistence.
- Attachment hashing/deduplication and IndexedDB draft storage.
- User-selectable ALFRED title templates.
- Explicit project-to-provider credential pinning; the shipped isolation mode learns each project's
  last selection.
- Add optional checkpoint-restored worktree forks to Codex message forks, and support portable
  transcript forks for providers without native turn forks.
- Persist an in-progress message-fork edit across app restarts and add an optional fork-family
  visualization if lineage banners alone become difficult to navigate.
- Conflict-aware two-way T3/Avi conversation merging instead of snapshot replacement.
- Signed public Windows releases and an Avi Code website.
- macOS/Linux branded installers after Windows stabilizes.

## Deliberate limits

- No OCR in v1.
- 20MB, 250 pages, and 500,000 extracted characters per document.
- Eight combined attachments per message.
- Five explicit thread references and 600,000 serialized context characters per turn.
- No conversation or attachment contents in ALFRED exports or window titles.
- No automated upstream merge or binary publication.

## Shipped

- 2026-07-28: upstream synchronization and guardrails.
- 2026-07-28: identity, branding, updater boundary, and T3 import.
- 2026-07-28: PDF/TXT/Markdown attachments.
- 2026-07-28: ALFRED metadata and privacy mode.
- 2026-07-29: repeatable, backed-up T3 workspace refresh from Avi Code settings.
- 2026-07-29: native repository/thread titles fixed for ActivityWatch and ALFRED attribution.
- 2026-07-29: per-chat provider/model badges, custom client initials, and compact status labels.
- 2026-07-29: timestamped provider authentication transition auditing.
- 2026-07-29: visible working-tree file count with one-click access to the changes panel.
- 2026-07-29: explicit cross-thread transcript context with source provenance.
- 2026-07-29: opt-in per-project provider/model memory and proactive credential usage checks.
- 2026-07-29: selectable colour themes (Oxblood, Midnight, Forest, Violet, Graphite), each with a
  light and a dark palette, orthogonal to the Light/Dark/System switch.
- 2026-07-30: desktop Codex “Edit and fork” from earlier user messages with lineage navigation.
- 2026-07-30: pinned sidebar threads and projects, held at the top in pin order while everything
  else keeps sorting by activity — wired into both the v1 tree/flat list and the v2 active block.
- 2026-07-31: per-turn communication styles (Default, Business, ELI5, Caveman, plus user-authored
  presets), picked from the composer, recorded per message, and spliced into the provider-bound
  text so the transcript stays exactly what the user typed.
- 2026-07-31: `CHANGELOG.md` plus an in-app `/changelog` page reached from under Settings in the
  sidebar, recording each version's fork changes and upstream sync separately so a merge never
  hides who wrote what.
- 2026-07-31: opt-in "Open chats at the last response", which starts a finished chat at the top of
  its last answer instead of the live edge, with the jump-to-end pill shown from the moment it
  opens.
