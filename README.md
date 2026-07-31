# Avi Code

Avi Code is a Windows-first desktop app for driving coding agents. It combines Codex and Claude
workflows with local PDF, TXT, and Markdown attachments, per-thread communication styles, and
repository/thread window metadata for time-tracking tools.

It uses the provider CLI authentication already present on the machine, so no additional LLM API key
is required. Install and sign in to the CLI you want to use (`codex`, `claude`, `cursor-agent`, or
`opencode`) before starting the app; without one, the UI loads but no agent can run.

## Alpha status

This is an alpha, built and used daily on Windows x64. Other platforms build from the same source but
are not exercised. Installers are currently unsigned, so Windows SmartScreen warns about an unknown
publisher on first run.

## Building the Windows installer

Requires Node `^24.13.1` (managed by the `vp` CLI) and a Rust toolchain with the MSVC linker, which
packaging invokes to build the native resource monitor.

```bash
vp install
vp run dist:desktop:win:x64
```

The installer lands in `release/`. The application has its own identity and storage:

- Display name: **Avi Code**
- Application ID: `com.advisoravi.avicode`
- Executable: `AviCode.exe`
- Protocol: `avicode://`
- Data home: `~/.avicode`
- Session originator: `avicode_desktop`
- Update repository: `TheDarkPhantom/avicode`

Official upstream binaries cannot update or replace Avi Code.

## Documentation

- [Development TODO](./TODO.md)
- [Future enhancements](./FUTURE_ENHANCEMENTS.md)
- [Document attachments](./docs/DOCUMENT_ATTACHMENTS.md)
- [Window title metadata](./docs/ALFRED_INTEGRATION.md)
- [Importing legacy T3 data](./docs/T3_IMPORT.md)
- [Upstream synchronization](./docs/UPSTREAM_SYNC.md)
- [Architecture overview](./docs/architecture/overview.md)

## Upstream attribution

Avi Code is an independent MIT-licensed fork of
[T3 Code](https://github.com/pingdotgg/t3code), not an official T3 Tools product. Invisible package
identifiers are retained where necessary for upstream compatibility. Product branding, desktop
identity, user data, releases, and added features remain owned by Avi Code.

See [UPSTREAM_SYNC.md](./docs/UPSTREAM_SYNC.md) for the human-reviewed update process.

## Development

The monorepo uses Vite+. Install the `vp` command, then install dependencies:

```bash
irm https://vite.plus/ps1 | iex
vp i
```

Read [CONTRIBUTING.md](./CONTRIBUTING.md) before changing the codebase.
