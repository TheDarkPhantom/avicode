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
- Explorer drag progress and cancellation.
- DOCX, CSV, JSON, and source archives.
- Encrypted PDF password prompts without persistence.
- Attachment hashing/deduplication and IndexedDB draft storage.
- User-selectable ALFRED title templates.
- Explicit project-to-provider credential pinning; the shipped isolation mode learns each project's
  last selection.
- Extend desktop Codex message forks to mobile and browser clients, add optional checkpoint-restored
  worktree forks, and support portable transcript forks for providers without native turn forks.
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
