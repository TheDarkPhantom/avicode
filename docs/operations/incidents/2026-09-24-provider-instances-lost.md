# Incident: provider instances vanished from the live desktop app

Date: 2026-09-24, roughly 00:15 to 00:30 local time
Status: resolved, deletion source unidentified
Impact: two of three configured Claude provider instances (Will, Lawrence) disappeared from the running app. No credential loss, no thread or history loss.

## Summary

`settings.json` in the live state directory (`~/.avicode/userdata/settings.json`) was deleted
while the desktop app was running. That file holds `ServerSettings.providerInstances`, the
registry of configured provider accounts. The settings watcher picked up the deletion, the
registry re-derived from defaults, and both non-default Claude instances dropped out of the UI
mid-session. A restart did not help because the file was gone, not stale.

Recovery: the instance list was rebuilt by hand from the `provider_instance_usage` table in
`state.sqlite` (instance ids `claudeAgent_will`, `claudeAgent_lawrence`) and each instance's
`homePath` (`~/.claude-will`, `~/.claude-lawrence`). OAuth tokens live inside those per-account
config directories and were untouched, so no re-login was needed.

## Timeline (local time, 2026-09-24)

- ~23:xx to 00:15: instances in use normally. Last recorded usage 2026-09-23 16:28 (default), 15:59 (Lawrence), 14:06 (Will).
- ~00:15 to 00:20: `settings.json` deleted while the server was running. Provider instances vanish live from the UI.
- 00:19: app's provider updater reinstalls `codex` and `opencode` via npm. Same window, but a coincidence, the updater does not touch settings.
- 00:21:29: user restarts the app. Server boots, finds no `settings.json`, falls back to defaults. `environment-id`, `keybindings.json`, `server-runtime.json`, and secret-store signing keys are written fresh at this timestamp.
- ~00:30: investigation confirms the file missing, rebuilds it, app hot-reloads it, instances return.

## Root cause

Direct cause: `settings.json` was deleted from `~/.avicode/userdata` while the app was running.
The settings watcher (`ServerSettingsService.streamChanges` ->
`ProviderInstanceRegistryHydration`) correctly propagated the empty state, which is why the
instances disappeared without a restart.

Who deleted it: unknown. Reading the NTFS change journal needs admin rights, and the rotating
trace logs (`server.trace.ndjson.*`, ~10 MB each, minutes of retention) had already rolled past
the window. The deletion hit a few small files in `userdata` but left `state.sqlite`, logs, and
attachments alone. Prime suspects are an external process (cleanup script, another agent
session) rather than the app itself: the app only writes the file atomically
(`writeFileStringAtomically`, temp file then rename) and has no code path that removes it.

## What made recovery possible

- `provider_instance_usage` in `state.sqlite` preserves every instance id ever used, so the exact ids could be restored (ids must match for old threads to re-bind).
- Per-instance `homePath` isolation means credentials live outside the app's state directory. Losing `settings.json` loses the list, not the logins.

## Follow-ups

- [ ] Back up `~/.avicode/userdata/settings.json` periodically. It is the one small file whose loss silently removes all configured provider instances.
- [ ] Consider persisting a last-known-good copy of `settings.json` (for example `settings.json.bak` written on each successful load) so the server can offer recovery instead of silently falling back to defaults.
- [ ] Consider logging a loud warning event when the settings file transitions from present to missing while the server is running, distinct from "parse failed".
- [ ] If this recurs, capture the NTFS USN journal (needs admin: `fsutil usn readjournal C:`) before it wraps.

## Restore procedure (if it happens again)

1. Confirm the file is missing: `~/.avicode/userdata/settings.json`.
2. List historical instance ids from the live DB (read-only):
   `SELECT DISTINCT provider_instance_id, driver_kind FROM provider_instance_usage` on
   `~/.avicode/userdata/state.sqlite`.
3. Rebuild `settings.json` with a `providerInstances` map. Claude instances need
   `driver: "claudeAgent"` and `config.homePath` pointing at the account's config directory
   (`~/.claude-<name>`). Keep the original instance ids.
4. The server watches the file and hot-reloads it. No restart required.
