# Development TODO — AviCode

Prioritized work. Structure: **shipped foundation → alpha verification → next work**.

**Last updated:** 2026-07-28

## Shipped foundation

- [x] Independent `AviCode`, `com.advisoravi.avicode`, `avicode://`, `~/.avicode`,
      `AviCode.exe`, and `avicode_desktop` identity.
- [x] Updater restricted to `TheDarkPhantom/avicode`.
- [x] Advisor Avi Register palette and AviCode vector/icon assets.
- [x] Copy-only first-launch T3 import with Import, Start Fresh, and Not Now choices.
- [x] PDF, TXT, and Markdown extraction and attachment metadata.
- [x] Repository/thread native window titles and privacy mode.
- [x] ALFRED-safe session metadata.
- [x] Human-reviewed weekly upstream synchronization.

## Personal alpha verification

- [ ] Install the Windows x64 package on Avi's daily-driver machine.
- [ ] Confirm AviCode and T3 run side by side with separate taskbar identities and data.
- [ ] Import a representative T3 database and verify projects, threads, settings, and migrations.
- [ ] Send an image, PDF, TXT, and Markdown file through Codex and Claude.
- [ ] Confirm encrypted/scanned PDF errors clearly explain the v1 limits.
- [ ] Confirm ActivityWatch sees `repository — thread — AviCode`.
- [ ] Run an ALFRED window and verify project/thread/work-kind calendar attribution.
- [ ] Verify privacy mode leaves only `AviCode` in the native title.

## Before public alpha

- [ ] Decide Windows signing and SmartScreen strategy.
- [ ] Add a manual release workflow and release notes.
- [ ] Add an explicit crash-reporting policy; do not inherit an upstream endpoint.
- [ ] Audit remaining visible T3 compatibility copy.
- [ ] Test upgrade from the latest personal AviCode database.

Completed work moves above. Non-blocking ideas go in `FUTURE_ENHANCEMENTS.md`; operating details
belong under `docs/`.
