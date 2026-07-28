# Avi Code

Avi Code is Advisor Avi's Windows-first agentic coding environment. It combines Codex and Claude
workflows with local PDF, TXT, and Markdown attachments, repository/thread window metadata, and
privacy-safe ALFRED time attribution.

It uses the provider CLI authentication already present on the machine; no additional LLM API is
required.

## Personal alpha

Install dependencies and build the Windows x64 installer:

```bash
corepack pnpm install
corepack pnpm dist:desktop:win:x64
```

The application has its own identity and storage:

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
- [ALFRED integration](./docs/ALFRED_INTEGRATION.md)
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
