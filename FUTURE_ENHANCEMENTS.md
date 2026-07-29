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

- Explorer drag progress and cancellation.
- DOCX, CSV, JSON, and source archives.
- Encrypted PDF password prompts without persistence.
- Attachment hashing/deduplication and IndexedDB draft storage.
- User-selectable ALFRED title templates.
- Explicit project-to-provider credential pinning; the shipped isolation mode learns each project's
  last selection.
- Conflict-aware two-way T3/Avi conversation merging instead of snapshot replacement.
- Signed public Windows releases and an Avi Code website.
- macOS/Linux branded installers after Windows stabilizes.

## Deliberate limits

- No OCR in v1.
- 20MB, 250 pages, and 100,000 extracted characters per document.
- Eight combined attachments per message.
- Five explicit thread references and 100,000 serialized context characters per turn.
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
