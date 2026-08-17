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

- Sidebar project folders live in `t3code:ui-state:v1` (per device), so a folder made on one client
  is not visible on another. Server-synced folders would change that. While Manual project sort is
  active and folders exist, cross-folder drag reorder is disabled: the folder-section view renders
  instead of the drag list, so a project moves between folders via its context menu, not by drag.
  The inline filter also bypasses folders — it flattens the sidebar to the matching rows.
- Folder reorder, hide, and collapsed-attention all live only on the v1 `Sidebar.tsx`. SidebarV2
  (the fork default) has no folder concept, so none of these appear there; bringing folders to v2
  is a separate, larger effort. Folder reorder drags the header only, so member rows do not travel
  with it during the drag; they snap to the new position on drop. Reordering the visible folders
  moves any hidden folders to the tail of the stored order (they are invisible, so position does
  not matter until they are shown again). "Show attention chats under collapsed folders" renders
  the whole member project row (collapsed) when any of its chats needs you, rather than only the
  individual attention chats; a tighter per-chat rollup is possible later.
- Completed read state stays local to each client in `t3code:ui-state:v1`, so opening a thread on
  one device does not clear its label on another. Server sync would change that choice. The local
  map also has no age or size pruning yet, though stale keys are small and harmless.
- Numbered-list recovery (`markdown-source-normalize.ts`) only rejoins continuation items that sit
  on their own lines. When a model emits them run together on one physical line (`6. a 7. b 8. c`),
  splitting on mid-sentence `N.` tokens would false-positive on prose ("Windows 11. Then..."), so
  those stay inline. A bold lead-in glued to the previous list item is also left attached; only the
  ordered items are pulled into their own list.
- The copy fix (`injectOrderedListOrdinals` in `markdown-clipboard.ts`) writes decimal ordinals into
  the copied HTML for every level, so nested ordered lists lose their `lower-alpha`/`lower-roman`
  styling (`index.css:1256`) on paste and read as `1.`/`2.` instead of `a.`/`i.`.
- The plan-review return leg (#143) keys both banners off a thread's _latest_ turn: a follow-up
  turn in the review thread drops the "Send findings" banner, and a plan refined after the review
  ran no longer matches the review's `sourceProposedPlan`, hiding the "review ready" banner even
  though the audit may still apply. Reviewing is also hard-coded to the first ready Codex instance
  and its first model; a provider/model picker on the "Review with…" action is the natural
  extension. Review threads are inferred (plan-mode turn + source-plan reference to another
  thread) rather than typed, which holds only while the Codex review flow is the sole creator of
  that shape.
- Expired questionnaire answers are restored as plain composer text so the user can confirm and
  resend them. Reconstructing the original multi-step questionnaire would require a durable client
  draft schema and is unnecessary while the plain-text recovery preserves every submitted value.
- `/btw` silently discards attached images, terminal contexts, and preview annotations. The
  `/plan`/`/default` branch in `ChatView`'s send handler refuses to claim the input when any of
  those are present, so they survive; the `/btw` branch has no such guard and clears the composer
  regardless. Whether a side question should carry an image at all is the open question, not just
  where to put the guard.
- With "Queue" chosen for sending mid turn, `/btw` is held as a queued turn rather than asked. The
  hold check runs early in the send handler, long before `/btw` is parsed, so the question fires
  after the turn settles, which is the opposite of the point. The default is "Steer", so this only
  bites users who changed it.
- `packages/shared/src/sideQuestionSupport.ts` hardcodes which providers can answer a side question
  and has no compile-time link to any adapter's `capabilities.sideQuestion`. The capability is not
  on the config push stream, so the client keeps its own copy and the two can drift silently. A new
  fork-session-capable adapter would get a hidden command; a Claude regression would get a visible
  one that always fails.
- A local server started outside an Avi Code terminal is not listed at all. The browser panel now
  offers only listeners the port scanner can attribute through its pid-to-terminal map, because
  guessing by process name and port range kept admitting vendor daemons (`aw-server`,
  `ArmouryHtmlDebugServer`, `nordvpn-service`) that in some cases genuinely serve HTTP. The cost is
  that a dev server from an external shell, a task runner, WSL, or `docker run` has to be reached by
  typing its URL into the panel's address bar. Closing that gap needs pid-to-working-directory
  resolution, which has no cheap Windows API; `native/resource-monitor` does not expose it either
  (`ProcessSample` has no cwd field and `process_refresh_kind()` does not request one), so widening
  the sidecar would be the smallest route and is not worth it yet.
- A machine where both `lsof` and the PowerShell probe fail now shows no local servers at all. The
  common-port TCP fallback was removed with the same change: it could learn no owning pid, so every
  row it produced was discarded by the ownership filter a moment later.
- Auto-opened script previews wait on the port scanner, so a script whose server the scanner cannot
  attribute to the thread (started through a wrapper the scanner reads as a different pid, or on a
  machine where `PortScanner` has no pid at all) gives up after a minute and opens nothing. The
  fallback is the same missing pid-to-working-directory resolution the entry above describes.
- Cross-repo assets are limited to registered projects. `AssetWorkspaceRoot.ts` honours a
  client-supplied root only when `getActiveProjectByWorkspaceRoot` finds it, because an asset URL is
  a signed HTTP token and must never point at an arbitrary path. `resolveFileSurfaceRoot` can also
  fall back to a file's own parent folder when no project matches, and an image or browser preview
  under such a root is still refused, while text under the same root reads fine through
  `projects.readFile`. Closing that gap needs a containment story for non-project roots, not a
  looser check.
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
- Queueing a send while a turn runs is client-side only, so it does not survive a reload. The
  `aviCodeSendWhileRunning` setting holds nothing but a flag: the composer keeps the user's own
  draft and the flush re-runs the same send once the turn settles, which is why there is no command,
  event, projector fold or migration. That was deliberate — orchestration V2 would throw all four
  away. The banner says the limitation out loud. Making it durable means either a server-side queue
  or persisting the intent next to the composer draft.
- Only one send is held per thread, because the hold IS the composer. Typing a second message while
  one is queued replaces the first rather than stacking, so there is no list of queued messages and
  no per-message Remove. Upstream's version (`pingdotgg/t3code#4245`) had a real per-thread queue
  with Steer and Remove chips; that PR was **closed unmerged** on 2026-07-30 in favour of
  orchestration V2 (`#2829`), which reportedly has the behaviour natively. Do not merge the dead
  branch — its seven commits sit on a base well over a hundred commits stale and it adds a colliding
  migration. After the V2 merge tracked in `TODO.md`, re-check whether V2 really ships this and
  delete the fork version if it does.
- A queued send pauses while you are looking at another thread. The flush needs the held thread's
  own composer to read the draft from, so navigating away holds it rather than sending it, and
  coming back resumes. Sending from a background thread would mean capturing the draft, which is
  exactly the serialization this design avoids.
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
- Plan-mode enforcement is Claude-only, and now says so. Every adapter declares
  `capabilities.planTurnEnforcement`; only the Claude adapter reports `"tool-denial"`, and the
  composer tooltip, the compact mode menu, and the Avi Code setting all warn on the other four.
  What is still missing is the enforcement itself. Codex, Cursor, Grok, and OpenCode delegate plan
  behaviour to their runtimes and **have not been observed** stopping after proposing a plan;
  `"unsupported"` records that absence of evidence, not a verified failure. Running a plan turn on
  each of the four and watching whether it builds is the next step, and any that does could be
  interrupted as soon as the plan is captured so it settles and the Implement button appears.
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
- The merge run does not rebase the loser. `useProjectMergeRun` walks a project's ready threads and
  runs `auto_merge` one at a time, stopping on the first conflict, and
  `GitWorkflowService.runStackedAction` takes a per-repository lock so concurrent runs queue rather
  than interleave git phases. What is still missing is any rebase of the branches behind the one
  that just landed, so a later PR in the run can still be stale even though it merged cleanly. A
  real merge queue, or nominating one thread as the integrator, would close that.
- Explorer drag progress and cancellation.
- DOCX, CSV, JSON, and source archives.
- Encrypted PDF password prompts without persistence.
- Attachment hashing/deduplication and IndexedDB draft storage.
- User-selectable ALFRED title templates.
- Explicit project-to-provider credential pinning; the shipped isolation mode learns each project's
  last selection.
- The timeline "Send again" action is web/desktop only — mobile's chat surface has no per-message
  resend. It is also hidden while the environment is unavailable instead of queueing through the
  offline turn outbox, and it resends the original text verbatim, so a prompt-effort prefix baked
  in at first send is kept even if the effort picker has since changed.
- Approvals have the same orphaning problem questions had: a pending approval is an in-memory
  `Deferred` whose request survives as a durable activity, so a restart leaves an approval prompt
  nobody can answer, and answering one still reports a red "Provider approval response failed".
  Everything the question fix needed already exists (`user-input.resolved` with `reason: "expired"`,
  the boot sweep in `ProviderCommandReactor.start`, `appendUserInputExpiredActivity`) and the
  approval twin was deliberately left byte-identical so the two can be compared. Doing it means the
  same treatment for `request.resolved`, `processApprovalResponseRequested`, and
  `respondToRequest`'s `allowRecovery`.
- Three adapters still misclassify a user-initiated abort and rely on the central
  `InterruptSuppression` guard rather than getting it right themselves. Cursor has no suppression at
  all, so a cancelled ACP prompt RPC becomes a `ProviderAdapterRequestError`
  (`CursorAdapter.ts:1007-1015` via `AcpAdapterSupport.ts:17-44`). Grok fails a prompt it just
  cancelled cleanly (`GrokAdapter.ts:1013-1017`) and `settlePromptInFlight` (`:360-432`) misses the
  `interruptedTurnIds` guard in its belonging branch. OpenCode never checks
  `error.name === "MessageAbortedError"` in its `session.error` handler
  (`OpenCodeAdapter.ts:1077-1115`), which is why its `lastError` used to stick.
- The stale-request detail predicate is duplicated across `decider.ts`, `ProjectionPipeline.ts`,
  `session-logic.ts`, and migration 024. They are currently in sync and this work added no new
  strings, but the approval follow-up above would be the moment to consolidate the three TypeScript
  copies behind one shared predicate.
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
- Twelve combined attachments per message.
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
