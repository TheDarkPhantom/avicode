# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` is the shared, authoritative policy file (git workflow, worktree isolation, dev servers,
fork conventions). This file covers the toolchain, the commands, and the architecture and invariants
that only become visible after reading several files.

## Toolchain

`vp` (Vite+) is the package manager, task runner, formatter, linter, and test runner. There is no
separate eslint/prettier/vitest CLI.

**Node `^24.13.1` is required and is not optional.** Node 22 cannot strip TypeScript, so anything
that loads a `.ts` config (`vite.config.ts`, the oxlint plugin) fails with
`ERR_UNKNOWN_FILE_EXTENSION` rather than a useful message. The `vp` inside `node_modules` is the
library build and has no `env` subcommand — only the globally installed CLI manages Node versions.

```bash
# One-time: install the global CLI (it fetches and pins Node itself)
irm https://vite.plus/ps1 | iex                     # Windows
curl -fsSL https://viteplus.dev/install.sh | bash   # POSIX

vp env use ^24.13.1
vp install
```

On Windows `vp env use` only affects the calling shell. Every new PowerShell session needs
`. "$env:USERPROFILE\.vite-plus\env.ps1"` first, or the line added to `$PROFILE`.

## Commands

```bash
vp test run <file> [<file>...]   # single test / focused set — the normal loop
vp test run --dir apps/server    # one package's suite
vp lint <path>                   # lint a directory or file
vp fmt <path>                    # format (CI fails on unformatted files)
vp run --filter @t3tools/server typecheck
node_modules/.bin/tsgo --noEmit -p apps/server/tsconfig.json   # same check, faster to target
```

`vp check` runs format + lint + typecheck together. Per `AGENTS.md`, do not run it or any other
repo-wide suite locally unless asked — CI owns full verification.

Desktop packaging (the Windows installer lands in `release/`):

```bash
vp run --filter @t3tools/desktop ensure:electron
vp run build:desktop
vp run dist:desktop:artifact --platform win --target nsis --arch x64 --skip-build
```

`--skip-build` assumes `build:desktop` already ran. `CSC_IDENTITY_AUTO_DISCOVERY=false` disables
signing, as CI does. Without a `--wsl-prebuild`, the packaged WSL backend will not start.

## Architecture

`docs/architecture/overview.md` has the diagrams. The parts that matter when changing code:

**The server is event-sourced.** Commands go through `orchestration/decider.ts`, which validates
invariants (`commandInvariants.ts`) and emits events; `orchestration/projector.ts` folds events into
the read model; the `persistence/` projection tables are the queryable form. A feature that adds
thread or project state usually touches all four layers plus a migration — changing only one leaves
the read model silently stale.

**Provider CLIs sit behind one interface.** `provider/Services/ProviderAdapter.ts` defines
`ProviderAdapterShape`; `Layers/{Claude,Codex,Cursor,Grok,OpenCode}Adapter.ts` implement it and
`ProviderAdapterRegistry.ts` selects one. Adding a capability means adding it to the shape and to
every adapter — a backend that cannot support it should fail loudly rather than degrade into
something that looks like success.

**Async work is queue-backed and announces itself.** `ProviderRuntimeIngestion`,
`ProviderCommandReactor`, and `CheckpointReactor` run on `DrainableWorker` and publish typed
receipts on `RuntimeReceiptBus`. Tests wait on receipts; they do not poll git state or sleep.

**`packages/contracts` is the wire boundary** and is schema-only, no runtime logic. Effect Schema
types there are shared by server, web, desktop, and mobile, so a field added to a contract schema
propagates into every decode site at once — see the SELECT trap below.

**`packages/client-runtime`** holds the client logic shared by web and mobile, behind explicit
subpath exports (`@t3tools/client-runtime/rpc`, `/connection`, `/environment`, …). Logic both
clients need belongs there rather than in `apps/web`.

## Invariants that bite

**Extending a projection schema breaks every query that feeds it.** `ProjectionThreadDbRowSchema`
derives from `ProjectionThread`, so a new column makes every `SELECT` that decodes into it required
to project that column. Miss one and decoding throws `Missing key at [...]` deep inside a reactor,
which can wedge the whole server suite rather than fail one test. Grep for a sibling column
(`worktree_path AS "worktreePath"`) to find all the call sites, and update `deepEqual` fixtures too.

**Migrations are numbered by hand.** `persistence/Migrations.ts` statically imports each file and
registers it under an explicit id. Two branches both adding `0NN_` collide at merge time and only
the registry id disambiguates — renumber rather than reuse.

**Custom lint rules** live in `oxlint-plugin-t3code/rules/` and are wired in through
`vite.config.ts`'s `jsPlugins`. They are not guessable from the code they reject:

- `no-global-process-runtime` — no `process.platform`/`env`/`cwd`; use `HostProcessPlatform` and
  friends from `@t3tools/shared/hostProcess`, which tests provide explicitly.
- `namespace-node-imports` — `import * as NodeFS from "node:fs"`, never named imports.
- `no-inline-schema-compile` — keep `Schema.decode*`/`encode*` compilation out of function bodies.
- `no-manual-effect-runtime-in-tests` — use the Effect test helpers.

**Fork versioning.** Versions stay on the upstream line with an `-avicode.N` prerelease suffix
(`0.0.29-avicode.1`) so the fork never advertises itself as newer than t3code. Four packages carry
the version and must move together: `apps/desktop`, `apps/server`, `apps/web`, `packages/contracts`.
Only `-nightly.` is special-cased by `resolveDesktopUpdateChannel` and
`resolveWebAssetBrandForPackageVersion`, so an `-avicode.N` build still resolves to production
branding on the `latest` channel.

**Known flaky tests**, unrelated to any given change: `git/GitManager.test.ts` (cross-repo PR
metadata, can time out) and `provider/Layers/ProviderRegistry.test.ts` (codex re-probe ordering).

On Windows a large slice of the `apps/server` suite fails locally for environment reasons — file
permissions, systemd, process diagnostics. Trust CI over a local full-suite run there.

## Providers at runtime

Agent providers are external CLIs (`codex`, `claude`, `cursor-agent`, `opencode`) probed on `PATH`
at startup and roughly every five minutes. Without one installed the UI loads but no agent can run,
and a newly installed CLI needs a server restart to be picked up promptly.
