# AGENTS.md

## Task Completion Requirements

- Keep local verification focused on the files and packages changed. Run the smallest relevant test set; do not run the full workspace test suite as a routine completion step.
  - Use `vp test run <test-files>` for focused built-in Vite+ tests. Use `vp run test` only when the affected package specifically requires its `test` script.
  - Backend changes must include and run focused tests for the changed behavior.
  - Run targeted formatting, lint, and type checks for the affected scope when available.
- Do not run repo-wide `vp check`, `vp run typecheck`, `vp run test`, or equivalent full-suite commands locally unless the user explicitly requests them. CI is responsible for the full verification suite.
- After frontend feature development or any user-visible frontend behavior change, the primary agent must run one integrated verification pass for each affected client surface after integrating the work:
  - Web: use the `test-t3-app` skill. Launch one isolated environment, authenticate through the printed pairing URL, and verify the affected flow in the controlled browser.
  - Mobile: use the `test-t3-mobile` skill. Connect one representative iOS Simulator or Android Emulator available on the host to one isolated environment and verify the affected flow. On compatible macOS hosts, prefer iOS for cross-platform changes and stream it through serve-sim in the T3 Code in-app browser or another available agent browser; use Android when it is the affected or viable platform.
  - Subagents must not independently launch dev servers or repeat integrated client verification unless their delegated task explicitly requires it.
  - Stop dev servers, watchers, and other long-running verification processes when the focused verification is complete.

## Git Workflow

Feature work does not land directly on `main`. Follow this for every non-trivial change unless Avi
says otherwise:

1. Branch off `main`: `git checkout -b <type>/<slug>` — `feat/`, `fix/`, `chore/`, `docs/`.
2. Commit on the branch. Stage the files you actually changed — never `git add -A`. This working
   tree routinely holds unrelated work in flight.
3. `git push -u origin HEAD`, then `gh pr create` against `main`. `gh` is authenticated for
   `TheDarkPhantom/avicode`.
4. **Merge commits, not squash** — `gh pr merge --merge --delete-branch`. Every PR so far landed as
   a merge commit; don't switch styles mid-history.
5. Sync local: `git checkout main && git pull --ff-only`, then confirm `git rev-parse main origin/main`
   agree. That checkout aborts on a dirty tree _after_ the remote merge already landed, so local
   `main` goes stale silently while the PR reads as merged.

Keep PRs small and focused. `.github/workflows/pr-size.yml` labels every PR `size:XS`…`size:XXL`
from its non-test diff, so scope creep shows up on the PR itself.

`origin` is the fork (`TheDarkPhantom/avicode`); `upstream` is `pingdotgg/t3code`. Never push to
`upstream`.

### Shipping is the default

When a chunk of work is finished and verified, carry it to `main` without being asked. Stopping at
"want me to commit?" is noise. Ask only when the change is genuinely ambiguous or Avi said to hold.

## Planning Documents

- `TODO.md` — the prioritized roadmap. Read it before starting work; tick items and refresh the
  **Last updated** line when they land.
- `FUTURE_ENHANCEMENTS.md` — after finishing a feature, review it for natural extensions and record
  any limitation hit while building.

Both are hand-maintained and are this repo's only running record of intent — there is no changelog.

## Avi Code Fork Conventions

This repo is a fork. Upstream keeps changing, and every Avi Code addition that lands in a shared
file is a future merge conflict. Keep the fork's surface area small and easy to find.

- Any new user-facing setting added by this fork must be surfaced on the **Avi Code settings page**
  (`apps/web/src/components/settings/AviCodeSettings.tsx`, route `settings.avicode.tsx`) — never on
  the upstream General/Appearance/Beta panels. Upstream can rewrite those panels freely without
  touching ours.
- Prefer new files under a fork-owned directory (e.g. `components/sidebar/`) over inline additions
  to large upstream files. When an upstream file must change, keep the edit to a thin branch or a
  single call site rather than interleaved logic.
- Comment fork-specific behaviour with a short "Avi Code addition" note explaining the upstream
  behaviour it replaces, so a merge conflict is resolvable without re-deriving the intent.
- Settings still live in the shared `ClientSettingsSchema` (`packages/contracts/src/settings.ts`);
  only the _UI_ is isolated. Give fork-added keys distinct names so they don't collide with a future
  upstream key.

## Parallel Agent Isolation

- Every agent that edits files must work in its own linked git worktree. Agents must not share a checkout; concurrent edits to the same working tree clash and silently overwrite each other.
- Create the worktree from the target base branch before making any change, and do all reads, edits, installs, and verification inside it.
- Read-only agents (search, exploration, review) may share the primary checkout. If an agent starts read-only and then needs to write, move it into a worktree first.
- Do not hand two agents the same worktree, even for tasks that look disjoint. One worktree, one agent, one task.
- Each worktree gets its own gitignored `.t3` dev state and its own preferred port offsets, so isolated agents also avoid dev-server and database collisions (see Dev Servers).
- Remove the worktree once its work is merged or abandoned. Leftover worktrees keep stale `.t3` state and port reservations alive.

## Dev Servers

- In a linked git worktree, dev state defaults to that worktree's gitignored `.t3`. This deliberately outranks an ambient `T3CODE_HOME`, which could otherwise select the installed app's live `~/.t3/userdata` database. An explicit `--home-dir` still wins.
- Start the web stack with `vp run dev`. Add `--share` when someone needs to open it from another device on the tailnet.
- Browser dev is single-origin: Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known` to the backend. Do not set `VITE_HTTP_URL` or `VITE_WS_URL` for `dev`/`dev:web`.
- Worktree paths supply stable preferred port offsets. Read the actual server and web ports from the `[dev-runner]` line because occupied ports can still shift them.
- Before handing off a `--share` URL, open its origin in a controlled browser and confirm the app loads. A successful curl is insufficient because browsers reject some otherwise reachable ports.

## Package Roles

- `apps/server`: Node.js WebSocket server. Wraps Codex app-server (JSON-RPC over stdio), serves the React web app, and manages provider sessions.
- `apps/web`: React/Vite UI. Owns session UX, conversation/event rendering, and client-side state. Connects to the server via WebSocket.
- `packages/contracts`: Shared effect/Schema schemas and TypeScript contracts for provider events, WebSocket protocol, and model/session types. Keep this package schema-only — no runtime logic.
- `packages/shared`: Shared runtime utilities consumed by both server and client applications. Uses explicit subpath exports (e.g. `@t3tools/shared/git`) — no barrel index.
- `packages/client-runtime`: Shared runtime package for sharing client code across web and mobile.

## Reference Repos

- Open-source Codex repo: https://github.com/openai/codex

Use these as implementation references when designing protocol handling, UX flows, and operational safeguards.

## Vendored Repositories

This project vendors external repositories under `.repos/` as read-only reference material for coding
agents.

- Prefer examples and patterns from the vendored source code over generated guesses or web search results.
- Do not edit files under `.repos/` unless explicitly asked.
- Do not import from `.repos/`; application code must continue importing from normal package dependencies.
- Manage vendored subtrees with `vpr sync:repos`; use `vpr sync:repos --repo <id>` to sync one configured repository.
- When updating a dependency with a configured vendored subtree, sync that subtree in the same change so
  `.repos/` matches the installed dependency version.
- When writing Effect code, read `.repos/effect-smol/LLMS.md` first and inspect `.repos/effect-smol/` for
  examples of idiomatic usage, tests, module structure, and API design.
- When writing relay infrastructure code with Alchemy, inspect `.repos/alchemy-effect/` for examples of
  idiomatic usage, tests, module structure, and API design.
