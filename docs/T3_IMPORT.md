# Importing T3 Code data

On first packaged launch, AviCode offers an import when `~/.t3/userdata/state.sqlite` exists and
AviCode has no database or prior decision.

- **Import** copies SQLite and present WAL/SHM companions to `~/.avicode/userdata`.
- **Start Fresh** records the choice without copying.
- **Not Now** changes nothing and offers again next launch.

The source is never moved, edited, or deleted. Close T3 before import for a consistent snapshot.
Logs, browser artifacts, and separate cloud credential stores are not copied.
