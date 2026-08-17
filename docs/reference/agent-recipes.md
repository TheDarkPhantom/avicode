# Agent Recipes

Detailed commands that are rarely needed. Referenced from `CLAUDE.md`.

## Desktop Packaging

Packaging needs a Rust toolchain (`x86_64-pc-windows-msvc` target, MSVC linker via Visual Studio
Build Tools C++ workload). Without it, `cargo build` in `stageResourceMonitor` fails.

```bash
vp run --filter @t3tools/desktop ensure:electron
vp run build:desktop
vp run dist:desktop:artifact --platform win --target nsis --arch x64 --skip-build
```

`--skip-build` assumes `build:desktop` already ran. `CSC_IDENTITY_AUTO_DISCOVERY=false` disables
signing. Without `--wsl-prebuild`, the packaged WSL backend will not start.

### Cut and build a new exe on CI (no local toolchain)

This is the default path when you have no local Rust/MSVC toolchain (e.g. the machine has no
`cargo`, so `stageResourceMonitor`'s `cargo build` and thus `dist:desktop:artifact` fail locally).
It cuts a new version and builds the Windows x64 installer entirely on CI. Nothing builds on the
local machine.

1. **Cut the version.** Bump all four fork packages (`apps/server`, `apps/desktop`, `apps/web`,
   `packages/contracts`) to the next `-avicode.N` version. Increment the last segment: e.g.
   `0.0.31-avicode.9.6` becomes `0.0.31-avicode.9.7`.

   ```bash
   node scripts/update-release-package-versions.ts 0.0.31-avicode.9.7
   ```

   If the worktree has no installed deps, the script fails with `ERR_MODULE_NOT_FOUND`
   (`@effect/platform-node`). In that case just edit the `"version"` field (line 3) in each of the
   four `package.json` files directly. The version string is not pinned in `pnpm-lock.yaml`
   (internal deps use the `workspace:` protocol), so no lockfile refresh is needed.

2. **Cut the changelog. Do not skip this — the version bump alone leaves it wrong.** `CHANGELOG.md`
   is bundled into the app (imported `?raw`) and rendered at `/changelog`, so an uncut changelog
   ships a stale "Unreleased" pile with no version header for the build you just made. Rename the
   `## Unreleased` heading to `## <new-version> (<YYYY-MM-DD>)` and move its entries under it. Cases:

   - **Normal cut:** rename `## Unreleased` to the new version with today's date. Leave no empty
     `## Unreleased` behind, since `parseChangelog.test.ts` requires every section to be non-empty;
     the next landed change re-adds the heading.
   - **Entries piled across skipped cuts** (a prior bump forgot this step): split the accumulated
     entries by PR merge time versus each prior `chore: release` commit. Entries merged before a
     given release commit belong to that version; later ones belong to the next. Find merge times
     with `gh pr list --state merged --json number,mergedAt` and release commits with
     `git log --grep '^chore: release'`.
   - Only user-visible PRs get an entry. Release-bump and internal tooling/doc PRs do not.
   - Follow the format in the HTML comment at the top of `CHANGELOG.md`: one short sentence,
     present tense, no em dashes, `(#<pr>)` suffix.

3. **Commit and push a branch.** Stage the four `package.json` files and `CHANGELOG.md`.
   Conventional message, e.g. `chore: release 0.0.31-avicode.9.7`. Push to `origin`.

4. **Dispatch the CI build.** `workflow_dispatch` on `avicode-guardrails.yml` runs the
   `windows-package` job on a `windows-2025` runner. It builds an **unsigned** NSIS `.exe`
   (`CSC_IDENTITY_AUTO_DISCOVERY=false`) carrying the **real** package version, and uploads it as
   artifact `avicode-windows-x64-installer` (retained 14 days). Dispatch on any ref (a feature
   branch works, not just `main`); the job checks out that ref and builds its code.

   ```bash
   gh workflow run avicode-guardrails.yml --ref <branch>
   sleep 8
   gh run list --workflow avicode-guardrails.yml --branch <branch> --limit 3 \
     --json databaseId,status,displayTitle,createdAt
   ```

5. **Watch and download.** The job takes up to 35 minutes.

   ```bash
   gh run watch <run-id> --exit-status --interval 30
   gh run download <run-id> --name avicode-windows-x64-installer --dir <out-dir>
   ```

The unsigned installer triggers a SmartScreen warning on first run (expected for personal-alpha
builds). PR runs of the same workflow are only a packaging check: they build `0.0.0-avicode-ci` and
upload nothing.

## routeTree.gen.ts Regeneration

`routeTree.gen.ts` is committed and only the Vite plugin writes it. Adding a file under
`apps/web/src/routes/` needs regeneration. Easiest: run `vp dev` or `vp build` once.

Manual approach from `apps/web`:

```js
const { Generator, getConfig } =
  await import("file:///<repo>/node_modules/.pnpm/@tanstack+router-generator@<version>/node_modules/@tanstack/router-generator/dist/esm/index.js");
await new Generator({ config: await getConfig({}, process.cwd()), root: process.cwd() }).run();
```

A correct run only adds lines. Deletions mean something drifted.

## Test Data Seeding

Seed a worktree's `.t3` with real data via `VACUUM INTO` (safe while a server has the source open):

```bash
mkdir -p .t3/userdata
rm -f .t3/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.t3/userdata/state.sqlite', { readonly: true }).run(\"VACUUM INTO '.t3/userdata/state.sqlite'\")"
```

A plain `cp` is only safe when no server has the source open, and must bring `-wal` and `-shm`.
Copy `secrets` and `settings.json` only if the flow under test needs them.

## Windows Worktree Cleanup

`git worktree remove` fails on deep `node_modules` paths ("Filename too long"). Use:

```powershell
Remove-Item -LiteralPath "\\?\<absolute-path>" -Recurse -Force
git worktree prune
```
