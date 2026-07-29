# Development TODO — Avi Code

Prioritized work. Structure: **shipped foundation → alpha verification → next work**.

**Last updated:** 2026-07-29

## Shipped foundation

- [x] Independent **Avi Code**, `com.advisoravi.avicode`, `avicode://`, `~/.avicode`,
      `AviCode.exe`, and `avicode_desktop` identity.
- [x] Updater restricted to `TheDarkPhantom/avicode`.
- [x] Advisor Avi Register palette and Avi Code vector/icon assets.
- [x] Remove active T3 wordmarks and visible upstream product copy from desktop/web surfaces.
- [x] Guard user-facing source against accidental T3 branding during upstream sync.
- [x] Copy-only first-launch T3 import with Import, Start Fresh, and Not Now choices.
- [x] Repeatable Settings → Avi Code import with online snapshot, attachment copy, backup, and
      backend restart.
- [x] PDF, TXT, and Markdown extraction and attachment metadata.
- [x] Repository/thread native window titles and privacy mode.
- [x] Electron-native title propagation so ActivityWatch receives the repository/thread title
      instead of the static application name.
- [x] Header indicator for working-tree changed-file counts with one-click diff access.
- [x] Per-chat provider/model badges with custom client initials and compact status labels.
- [x] ALFRED-safe session metadata.
- [x] Human-reviewed weekly upstream synchronization.
- [x] Manual-only release and relay workflows; merging `main` cannot publish or deploy.
- [x] Persistent per-instance provider authentication transition audit log.
- [x] Explicit cross-project thread references with full transcript context and provenance.

## Personal alpha verification

- [ ] Install the Windows x64 package on Avi's daily-driver machine.
- [ ] Confirm Avi Code and T3 run side by side with separate taskbar identities and data.
- [ ] Import a representative T3 database and verify projects, threads, settings, and migrations.
- [ ] Send an image, PDF, TXT, and Markdown file through Codex and Claude.
- [ ] Confirm encrypted/scanned PDF errors clearly explain the v1 limits.
- [ ] Confirm ActivityWatch sees `repository — thread — Avi Code`.
- [ ] Run an ALFRED window and verify project/thread/work-kind calendar attribution.
- [ ] Verify privacy mode leaves only `Avi Code` in the native title.

## Before public alpha

- [ ] Decide Windows signing and SmartScreen strategy.
- [ ] Add a manual release workflow and release notes.
- [ ] Add an explicit crash-reporting policy; do not inherit an upstream endpoint.
- [ ] Test upgrade from the latest personal Avi Code database.

Completed work moves above. Non-blocking ideas go in `FUTURE_ENHANCEMENTS.md`; operating details
belong under `docs/`.
