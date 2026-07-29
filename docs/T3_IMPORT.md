# Importing T3 Code data

On first packaged launch, Avi Code offers an import when `~/.t3/userdata/state.sqlite` exists and
Avi Code has no database or prior decision.

- **Import** creates a consistent SQLite snapshot in `~/.avicode/userdata`.
- **Start Fresh** records the choice without copying.
- **Not Now** changes nothing and offers again next launch.

After setup, **Settings → Avi Code → Import latest** can refresh Avi Code from T3 Code again. The
repeat import:

1. Takes an online SQLite snapshot, so T3 Code may remain open.
2. Stops Avi Code's local backends.
3. Backs up the current Avi Code database under
   `~/.avicode/userdata/t3-import-backups/<timestamp>/`.
4. Replaces the conversation database with the latest T3 snapshot.
5. Copies T3 attachment files into Avi Code.
6. Restarts the local backends.

Provider instances, credentials, client preferences, and Avi Code settings live outside the
conversation database and remain unchanged. Conversations created only in Avi Code are not merged
into the T3 snapshot; they remain recoverable from the timestamped database backup.

The T3 source is never moved, edited, or deleted. Logs, browser artifacts, and separate credential
stores are not copied.
