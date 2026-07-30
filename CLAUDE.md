# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

`AGENTS.md` is the shared, authoritative policy file (git workflow, worktree isolation, dev servers,
fork conventions). Most of it is upstream's text, kept verbatim so merges stay clean; the
**Avi Code overrides** block at the bottom wins where the two disagree. Read that block — it inverts
three upstream rules: shipping is the default here (upstream says never PR unless asked), the
integrated client pass is required rather than on request, and you do open a `--share` URL once to
confirm it loads. This file covers the toolchain, the commands, and the architecture and invariants
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
repo-wide suite locally unless asked — CI owns full verification. What CI actually gates on:
`vp check`, `vpr typecheck`, `vp run test`, `vp run build:desktop`, `node scripts/release-smoke.ts`,
`cargo fmt --check`/`cargo test` for `native/resource-monitor`, and the fork guardrails below.

Fork-only checks (`.github/workflows/avicode-guardrails.yml`, runs on every PR):

```bash
vp run check:avicode   # identity/branding boundaries — see "The fork's identity is CI-enforced"
vp run test:avicode    # unit tests for the guardrail script itself
```

Desktop packaging (the Windows installer lands in `release/`):

```bash
vp run --filter @t3tools/desktop ensure:electron
vp run build:desktop
vp run dist:desktop:artifact --platform win --target nsis --arch x64 --skip-build
```

`--skip-build` assumes `build:desktop` already ran. `CSC_IDENTITY_AUTO_DISCOVERY=false` disables
signing, as CI does. Without a `--wsl-prebuild`, the packaged WSL backend will not start.

**Packaging needs a Rust toolchain, and it is not optional.** `stageResourceMonitor` in
`scripts/build-desktop-artifact.ts` runs `cargo build` for `native/resource-monitor` unconditionally
— there is no skip flag. On Windows the target is `x86_64-pc-windows-msvc`, so it needs rustup _and_
the MSVC linker (Visual Studio Build Tools, C++ workload); a machine with neither fails at
`spawn cargo ENOENT`. This arrived with the v0.0.31 upstream merge, so older local build notes
predate it.

To get an installer without that toolchain, dispatch the packaging job instead:

```bash
gh workflow run avicode-guardrails.yml --ref main
gh run download <run-id> --name avicode-windows-x64-installer --dir release
```

The runner has Rust. A `workflow_dispatch` builds with the real package version and uploads the
installer for 14 days; pull-request runs keep the throwaway `0.0.0-avicode-ci` version and upload
nothing, because they only exist to prove packaging still works.

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
something that looks like success. `capabilities.sideQuestion` (`/btw`) is the worked example:
Claude reports `"fork-session"`, the other four report `"unsupported"` and their `askSideQuestion`
fails, and the UI hides the command for them. Expect to touch every adapter plus their test doubles.

**Adding a WS RPC is compile-time checked.** `apps/server/src/auth/RpcAuthorization.ts` holds
`RPC_REQUIRED_SCOPES`, and `RpcAuthorization.test.ts` asserts its keys equal `WsRpcGroup.requests`
exactly. Registering an RPC without choosing a scope is a type error and a failing test rather than
a runtime throw on first use. (Upstream introduced this in v0.0.31; it immediately caught a
fork RPC — `voice.createToken` — that had never had a scope at all.) Streaming RPCs additionally
need their tag in `EnvironmentStreamCommandRpcTag` (`packages/client-runtime/src/rpc/client.ts`);
unary ones need nothing there.

**Async work is queue-backed and announces itself.** `ProviderRuntimeIngestion`,
`ProviderCommandReactor`, and `CheckpointReactor` run on `DrainableWorker` and publish typed
receipts on `RuntimeReceiptBus`. Tests wait on receipts; they do not poll git state or sleep.

**`packages/contracts` is the wire boundary** and is schema-only, no runtime logic. Effect Schema
types there are shared by server, web, desktop, and mobile, so a field added to a contract schema
propagates into every decode site at once — see the SELECT trap below.

**`packages/client-runtime`** holds the client logic shared by web and mobile, behind explicit
subpath exports (`@t3tools/client-runtime/rpc`, `/connection`, `/environment`, …). Logic both
clients need belongs there rather than in `apps/web`.

**Not everything is TypeScript.** `native/resource-monitor` is a Rust crate (cargo, its own
`Cargo.toml`) that CI formats and tests separately; `vp` does not cover it.

The fork's own features have their own docs: `docs/DOCUMENT_ATTACHMENTS.md`,
`docs/ALFRED_INTEGRATION.md`, `docs/T3_IMPORT.md` (importing an upstream `~/.t3` database), and
`docs/UPSTREAM_SYNC.md` (the human-reviewed merge process).

## Invariants that bite

**Extending a projection schema breaks every query that feeds it.** `ProjectionThreadDbRowSchema`
derives from `ProjectionThread`, so a new column makes every `SELECT` that decodes into it required
to project that column. Miss one and decoding throws `Missing key at [...]` deep inside a reactor,
which can wedge the whole server suite rather than fail one test. Grep for a sibling column
(`worktree_path AS "worktreePath"`) to find all the call sites, and update `deepEqual` fixtures too.

**Migrations are numbered by hand.** `persistence/Migrations.ts` statically imports each file and
registers it under an explicit id. Two branches both adding `0NN_` collide at merge time and only
the registry id disambiguates — renumber rather than reuse. On an upstream merge, renumber
_upstream's_, never the fork's: fork ids are already applied in users' databases, so moving one
re-runs a migration that has run. `038_ProjectionThreadTitleRegeneration` is the live precedent —
upstream shipped it as `035`, which the fork already owned. Renumbering means the file, the import,
the registry entry, and any `toMigrationInclusive` steps in its test.

**Custom lint rules** live in `oxlint-plugin-t3code/rules/` and are wired in through
`vite.config.ts`'s `jsPlugins`. They are not guessable from the code they reject:

- `no-global-process-runtime` — no `process.platform`/`env`/`cwd`; use `HostProcessPlatform` and
  friends from `@t3tools/shared/hostProcess`, which tests provide explicitly.
- `namespace-node-imports` — `import * as NodeFS from "node:fs"`, never named imports.
- `no-inline-schema-compile` — keep `Schema.decode*`/`encode*` compilation out of function bodies.
- `no-manual-effect-runtime-in-tests` — use the Effect test helpers.

**The fork's identity is CI-enforced, including a brand-string ban.**
`scripts/avicode/check-upstream-guardrails.mjs` fails the PR if the literal string `T3 Code` appears
in any non-test `.ts`/`.tsx` under `apps/{web,desktop,server}/src` or
`packages/{contracts,shared}/src`, outside a three-file allowlist (`DesktopEnvironment.ts`,
`LegacyT3Import.ts`, `AviCodeSettings.tsx` — the legacy-import compatibility copy). So a new UI
string, log line, or comment saying "T3 Code" is a build break, not a style nit. User-visible names,
OS identity, storage roots, protocol, and release ownership must come from `AVICODE_IDENTITY`
(`packages/shared/src/avicodeIdentity.ts`); internal package names and env vars stay upstream
(`@t3tools/*`, `T3CODE_HOME`). The same script pins `.avicode/upstream-guardrails.json` (upstream
stays `pingdotgg/t3code` main, releases stay `TheDarkPhantom/avicode`), forbids `sync-upstream.yml`
from merging its own PR, and requires `release.yml`/`deploy-relay.yml` to stay manual-only for the
personal alpha — adding a `push:`/`schedule:` trigger to either fails the check.

**Two state directories, and the live one is not the one `AGENTS.md` names.** `AGENTS.md`'s Test
data and "writing to the live install" guidance is upstream text and still says `~/.t3/userdata`.
For this fork the installed desktop app's real database is **`~/.avicode/userdata`** (from
`AVICODE_IDENTITY.homeDirectoryName`, resolved in `DesktopEnvironment.ts`) — snapshot that when you
want realistic seed data. `~/.t3` is upstream T3 Code's data plus this repo's dev state: `devHome.ts`
still gives `vp run dev` and each worktree a gitignored `.t3`, and `T3CODE_HOME` is still the env
var. Treat `~/.avicode/userdata` with the same don't-touch rules the upstream text applies to
`~/.t3/userdata`.

**Fork versioning.** Versions stay on the upstream line with an `-avicode.N` prerelease suffix
(`0.0.31-avicode.1`) so the fork never advertises itself as newer than t3code. Four packages carry
the version and must move together: `apps/desktop`, `apps/server`, `apps/web`, `packages/contracts`.
Only `-nightly.` is special-cased by `resolveDesktopUpdateChannel` and
`resolveWebAssetBrandForPackageVersion`, so an `-avicode.N` build still resolves to production
branding on the `latest` channel.

**The Beta sidebar is on by default in dev.** `sidebarV2Enabled` defaults to `false` in the schema,
which is misleading: `resolveSidebarV2Default` (`apps/web/src/branding.logic.ts`) overrides it to
`true` for the `dev` and `nightly` stages unless the user has made an explicit choice. So `vp run dev`
renders `SidebarV2.tsx`, while a packaged Alpha build renders v1 (`sidebar/SidebarThreadRow.tsx`).
Sidebar work usually needs both, and a dev server alone will not show you the one most users see.

**Slash-command parsing exists twice.** `packages/shared/src/composerTrigger.ts` and
`apps/web/src/composer-logic.ts` each define `ComposerSlashCommand` and
`parseStandaloneComposerSlashCommand`. `apps/web` imports the _local_ copy, so changing only the
shared one silently does nothing. Prefer re-exporting from shared over adding a third copy.

**Known flaky tests**, unrelated to any given change: `git/GitManager.test.ts` (cross-repo PR
metadata, can time out) and `provider/Layers/ProviderRegistry.test.ts` (codex re-probe ordering).

On Windows a large slice of the `apps/server` suite fails locally for environment reasons — file
permissions, systemd, process diagnostics. `keybindings.test.ts`'s "config directory is not
writable" case is one of these: it relies on `chmod`, which is a no-op on Windows. Trust CI over a
local full-suite run there.

**Worktrees inside the repo pollute local test runs.** `.claude/worktrees/` is not gitignored, so a
linked worktree there is visible to `vp test run`'s globs — one focused run can pick up four copies
of the same test and fail them all on unresolved imports. CI is unaffected (fresh checkout). Remove
worktrees when done; on Windows `git worktree remove` fails on deep `node_modules` paths with
"Filename too long", and
`Remove-Item -LiteralPath "\\?\<abs-path>" -Recurse -Force` in PowerShell is what actually clears
them (then `git worktree prune`).

## Providers at runtime

Agent providers are external CLIs (`codex`, `claude`, `cursor-agent`, `opencode`) probed on `PATH`
at startup and roughly every five minutes. Without one installed the UI loads but no agent can run,
and a newly installed CLI needs a server restart to be picked up promptly.
