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

To build without a local Rust toolchain, dispatch the CI job:

```bash
gh workflow run avicode-guardrails.yml --ref main
gh run download <run-id> --name avicode-windows-x64-installer --dir release
```

`workflow_dispatch` builds with the real package version and uploads for 14 days. PR runs use
`0.0.0-avicode-ci` and upload nothing.

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
