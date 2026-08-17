# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

AGENTS.md is upstream text kept verbatim for merge cleanliness, plus fork overrides at the bottom.
The fork overrides supersede these upstream AGENTS.md sections: "Multi-surface" (desktop-only), "Hit
every surface" (desktop-only), "Pull requests" (ship by default), "Dev servers" (open `--share`
URL), "Verifying" (integrated client pass required). When in doubt, the overrides win.

## Toolchain

`vp` (Vite+) is the package manager, task runner, formatter, linter, and test runner. No separate
eslint/prettier/vitest CLI.

**Node `^24.13.1` required.** Node 22 fails with `ERR_UNKNOWN_FILE_EXTENSION` on `.ts` configs.
On Windows, source `. "$env:USERPROFILE\.vite-plus\env.ps1"` each shell (or add to `$PROFILE`).
Git Bash: `. ~/.vite-plus/env`.

```bash
vp env use ^24.13.1
vp install
```

## Commands

```bash
vp test run <file> [<file>...]   # single test / focused set
vp test run --dir apps/server    # one package's suite
vp lint <path>                   # lint
vp fmt <path>                    # format
vp run --filter @t3tools/server typecheck
node_modules/.bin/tsgo --noEmit -p apps/server/tsconfig.json   # faster targeted typecheck
```

Do not run `vp check` or any repo-wide suite locally unless asked. CI gates on: `vp check`,
`vpr typecheck`, `vp run test`, `vp run build:desktop`, `node scripts/release-smoke.ts`,
`cargo fmt --check`/`cargo test`, and `vp run check:avicode`/`vp run test:avicode` (fork guardrails).

Desktop packaging and routeTree generation: see `docs/reference/agent-recipes.md`.

## Architecture

`docs/architecture/overview.md` has diagrams. Key patterns:

**Event-sourced server.** Commands go through `orchestration/decider.ts`, validated by
`commandInvariants.ts`, emitting events. `projector.ts` folds events into the read model.
`persistence/` tables are the queryable form. A new thread/project field usually touches all four
layers plus a migration.

**One provider interface.** `ProviderAdapter.ts` shape, per-provider `Layers/*Adapter.ts`, selected
by `ProviderAdapterRegistry.ts`. New capabilities need all adapters (fail loudly if unsupported).

**Compile-time checked RPCs.** `RpcAuthorization.ts` keys must equal `WsRpcGroup.requests` (tested).
Streaming RPCs also need `EnvironmentStreamCommandRpcTag` in `client-runtime/src/rpc/client.ts`.

**Queue-backed async.** `DrainableWorker` + `RuntimeReceiptBus`. Tests wait on receipts, never sleep.

**`packages/contracts`** = wire boundary, schema-only. A field change propagates to all decode sites.

**`packages/client-runtime`** = shared client logic (subpath exports). Fork features can live in
`apps/web` since only desktop is delivered.

**Rust crate.** `native/resource-monitor` uses cargo, CI-tested separately from `vp`.

**`CHANGELOG.md` is code.** Imported via `?raw` in `changelogSource.ts`, parsed by
`parseChangelog.ts`, rendered at `/changelog`. The HTML comment at the top is the format spec;
`parseChangelog.test.ts` enforces it against the real file.

## Invariants

**Projection schema breaks SELECTs.** New column on `ProjectionThreadDbRowSchema` requires updating
every `SELECT` that decodes into it. Grep a sibling column (`worktree_path AS "worktreePath"`) to
find sites. Update `deepEqual` fixtures too.

**Hand-numbered migrations.** `persistence/Migrations.ts` registers ids explicitly. On upstream
merges, renumber upstream's ids, never the fork's (fork ids are already in user DBs).
`038_ProjectionThreadTitleRegeneration` is the precedent (upstream shipped as `035`).

**Custom lint rules** (`oxlint-plugin-t3code/rules/`): `no-global-process-runtime` (use
`HostProcessPlatform`), `namespace-node-imports` (`import * as NodeFS`),
`no-inline-schema-compile`, `no-manual-effect-runtime-in-tests`.

**Brand-string ban.** `check-upstream-guardrails.mjs` fails PRs with literal `T3 Code` in non-test
source (three-file allowlist). Use `AVICODE_IDENTITY` (`packages/shared/src/avicodeIdentity.ts`).

**Tests import `vite-plus/test`, never `vitest`.** `vitest` is undeclared; importing it gives
`TS2307`.

**Two state directories.** `~/.avicode/userdata` is the live desktop DB (don't touch).
`~/.t3` is upstream data plus dev state (`T3CODE_HOME`). Dev servers use per-worktree `.t3/`.

**Fork versioning.** `-avicode.N` suffix on upstream's version. Four packages move together:
`apps/desktop`, `apps/server`, `apps/web`, `packages/contracts`. Cutting a version also means cutting
`CHANGELOG.md` (rename `## Unreleased` to the new version) — the bundled changelog renders at
`/changelog`, so a version bump without a changelog cut ships a build with no matching entry. To cut
a version and build a new installer without a local toolchain, see "Cut and build a new exe on CI" in
`docs/reference/agent-recipes.md`.

**Beta sidebar default.** `resolveSidebarV2Default` overrides to `true` for dev/nightly. Dev shows
SidebarV2; packaged Alpha shows v1.

**Slash-command parsing exists twice.** `packages/shared/src/composerTrigger.ts` and
`apps/web/src/composer-logic.ts`. Web imports its local copy; changing only shared does nothing.

**Known flaky tests:** `GitManager.test.ts`, `ProviderRegistry.test.ts`, `selfUpdate.test.ts`. Run
`git diff --stat origin/main...HEAD -- apps/server packages` before blaming your branch.

**Windows local tests:** Many `apps/server` tests fail locally (chmod, systemd). Trust CI.
Worktrees under `.claude/worktrees/` pollute test globs; see `docs/reference/agent-recipes.md` for
cleanup.

## Providers at runtime

External CLIs (`codex`, `claude`, `cursor-agent`, `opencode`) probed on `PATH` at startup and every
~5 minutes. Newly installed CLI needs server restart.
