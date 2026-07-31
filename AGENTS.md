# T3 Code

T3 Code is a minimal GUI for coding agents. A Node WebSocket server wraps provider CLIs (Codex, Claude Code, Cursor, Grok, OpenCode) and serves web, desktop, and mobile clients.

You can think of T3 Code as an open source "bring-your-own-subscription" alternative to apps like Claude Desktop, Codex App, Cursor Glass and Conductor.

> **This is a fork.** `origin` is `TheDarkPhantom/avicode`; `upstream` is `pingdotgg/t3code`. The
> **Avi Code overrides** section at the bottom of this file wins wherever it contradicts the
> upstream guidance above it — notably on shipping and on integrated verification.

## What makes T3 Code special?

We have over 100,000 users who love T3 Code. It's important we maintain the things they love as we continue to iterate on the product. Here's a brief list of the things we can never compromise on.

### 1. Open at the core

T3 Code is truly open. We share our roadmap, we share how we think about things, and of course we share all our code. A large number of our users run forks. We work in the open, and should strive to stay that way.

### 2. Performance without compromise

Lots of apps have gotten bogged down with bad tech decisions and "slop". We have not, and we're proud of the performance of T3 Code. We regularly audit for performance regressions, often caused by sending too much data over websockets, css animations causing gpu spikes, lists being hard to render, and more. Make sure all changes are considerate of performance impact.

### 3. Remote ready

The architecture of T3 Code's websocket layer (npx t3) enables a lot of awesome remote features. These have become core to the product. Whether users are connecting directly over their local network, using Tailscale, or leaning in fully with T3 Connect (our tunnel solution, also in this repo), we need to make sure new features are properly supported.

### 4. Multi-surface

T3 Code has 3 key app surfaces: **web**, **desktop**, and **mobile**.

**Web** is kind of two surfaces, as we have the public facing "app.t3.codes" as well as locally hosting the web app through the `npx t3` command. Both need to be supported by all new features where reasonable.

**Desktop** is the main surface most users install first. It's a full Electron app that bundles the server runner as well. The desktop app can also be used as the host server, allowing remote connections from app.t3.codes or the mobile app.

**Mobile** is a React native app for both iOS and Android. The mobile app allows for connecting to any T3 Code server to control work remotely. It is still in early access (Testflight), but it is pretty close to shipping globally.

## A note from Theo

I like ambitious ideas, simple systems, and software that feels obvious. Do not preserve complexity just because it already exists. Do not introduce machinery because it looks architecturally impressive. Understand the real constraint, then fight for the smallest model that makes the correct behavior unsurprising.

Channel both "measure twice, cut once" and "yagni". Fight scope creep. Try to honor the dev's intent in both a minimal and realistic fashion.

The rest of this document is meant to help you navigate the codebase and make changes effectively. Think of these instructions less as "hard rules", more as "good defaults". The developer's preferences should be able to override anything here.

Of note: Most T3 Code contributions will come from T3 Code itself, often controlled remotely. This means you should be careful about accessing data, killing dev servers, and other things that may damage the T3 Code instance that the contributor is using.

## A small glossary

We need to be on the same page with terminology. When communicating, use this language:

- **you** means the agent reading this file and changing T3 Code.
- **we, us, and maintainers** mean Theo, Julius and the people building T3 Code. These are who you are talking to now.
- **user** means the person using T3 Code to direct coding agents.
- **agent** means the coding agent a user runs inside T3 Code. Depending on context, that may also include you.
- **provider** means the agent runtime or harness T3 Code talks to, such as Codex, Claude, Cursor, or OpenCode.
- **client** means the web, desktop, or mobile UI.
- **environment** means one running T3 server and the machine, filesystem, provider credentials, and state it owns.
- **project** means an environment-local workspace record rooted at a directory.
- **thread** means the durable conversation and work history for a project.
- **turn** means one user-to-agent cycle, including follow-up work such as checkpointing.
- **T3 home** means the base data directory. Runtime state normally lives below its userdata directory.

## The three ways to hurt yourself

1. **Killing by pattern.** Never `pkill -f`, `pgrep | kill`, or `kill` a PID you found by matching a name, path, or worktree string. Your own agent process has this worktree's path in its argv, and this machine runs several other dev servers at once. Kill only a PID you captured at spawn, or the owner of your port from `ss -H -ltnp` after confirming `/proc/<pid>/cwd` is your worktree.
2. **Writing to the live install.** `~/.t3/userdata` is the developer's real T3 Code database, in use while you work. Reading it and copying from it are fine, and a good way to get real test data (see Test data). Never start a server against it, never open it read-write, never clean it up.
3. **Baking in origins.** Never set `VITE_HTTP_URL` or `VITE_WS_URL` for dev. Dev is single-origin and Vite proxies `/api`, `/ws`, `/oauth`, and `/.well-known`. Setting them bakes localhost into the bundle and silently breaks every remote browser.

## Hit every surface

The most common defect in this repo is a change that works on the path you tested and is missing everywhere else. Before calling frontend work done, walk this list and say which entries applied:

- **Entry points.** A behavior reachable from the chat view is usually also reachable from Settings, the command palette, and a keybinding. Fixing one is not fixing the feature.
- **Clients.** Web, desktop (wraps web, adds Electron shell/IPC), and mobile (React Native, separate navigation). Shared logic lives in `packages/client-runtime`
- **Providers.** Codex, Claude, Cursor, Grok, and OpenCode each have an adapter. Provider-shaped features need a decision per adapter, even if the decision is "not supported here".
- **Contracts.** Anything crossing the wire is typed in `packages/contracts`. Change the schema and the server, web, mobile, and desktop all follow.
- **Reverse states.** If you added a way in, add the way out and the way to see it. Snooze needs unsnooze. Close needs reopen. A one-way door is a bug.
- **Connection modes.** Local, remote/relay, and tunnel behave differently. Multi-device and multi-environment cases are real.
- **Docs.** `docs/` mirrors this structure. Behavior changes that a user would notice belong in `docs/user/`; architecture changes in `docs/architecture/`; new vocabulary in `docs/reference/encyclopedia.md`.

## Dev servers

- `vp i` installs. Worktrees get this from the t3.json setup script; if module resolution looks broken, it probably did not run.
- `vp run dev` starts server and web. In a worktree, state defaults to that worktree's gitignored `.t3`, which deliberately outranks an ambient `T3CODE_HOME` so you cannot land on shared state by accident. An explicit `--home-dir` still wins.
- Ports derive from the worktree path and are stable across restarts, but read the real ones from the `[dev-runner]` line since occupied ports shift.
- `--share` publishes over the tailnet. Do not open the URL when you use this, just send it to the user with the pairing code included in url
- The web app requires pairing. Hand over the pairing URL, not the bare origin. A URL without its token is useless to whoever you gave it to.
- Stop what you started, by the PID you tracked. See rule 1.

## Test data

An empty database is a bad test. Seed your worktree's `.t3` with a copy of real data instead of pointing at live state:

- Copy from `~/.t3/userdata` (the developer's real data, the most realistic test set) or `~/.t3/dev`. Worktree state lives at `<worktree>/.t3/userdata`.
- Snapshot the database with `VACUUM INTO`, which is safe even while a server has the source open and yields one consistent file:

  ```bash
  mkdir -p .t3/userdata
  rm -f .t3/userdata/state.sqlite*  # VACUUM INTO refuses to overwrite
  bun -e "new (require('bun:sqlite').Database)(process.env.HOME + '/.t3/userdata/state.sqlite', { readonly: true }).run(\"VACUUM INTO '.t3/userdata/state.sqlite'\")"
  ```

  A plain `cp` is only safe when no server has the source open, and must bring the `-wal` and `-shm` siblings along. A live file copy is a corrupt copy.

- Bring `secrets` and `settings.json` only if the flow under test needs them.
- Copy in, never symlink. Data flows one way: into your sandbox, never back out.

## Verifying

- Smallest proof that the change works. `vp test run <files>` for the tests you touched, targeted lint and typecheck for the scope you changed.
- **Do not run repo-wide checks.** No `vp check`, no `vp run -r test`, no `vp run -r typecheck` unless I ask. CI owns the full suite.
- Backend behavior changes ship with focused tests for that behavior.
- The server is event-sourced and its async flows emit typed receipts. Wait on receipts and worker drains, never on sleeps or polling. A test that needs a timeout to pass is wrong.
- Upon request, user-visible frontend changes should get one integrated pass in a real client: `test-t3-app` for web, `test-t3-mobile` for mobile. The primary agent does this once after integrating. Subagents do not launch their own dev servers. Ask permission before doing computer use or spinning up browsers.

## Pull requests

- Never make a PR unless the developer explicitly asks you to do so.
- Conventional commit titles, plain language: `fix(web): new threads no longer spike CPU`.
- Body: the problem in a sentence or two, then how you fixed it. End with the model and harness that did the work.
- **Rebase onto latest main before opening.** Stale branches conflict and burn a review round.
- UI changes need before/after images. Motion or timing needs a short video.
- One concern per PR. If the description says "also", split it.
- When babysitting: poll checks and comments newer than the last push, verify each bot finding against the source, fix real ones, dismiss false positives with a written reason. Stay quiet when nothing is new. Stop when the bots are green on the latest commit.

## How it works

Clients send typed WebSocket requests. The server turns them into _commands_, a pure _decider_ turns commands into persisted _events_, and a _projector_ derives the read model the UI renders. Provider CLIs run as subprocesses; per-provider _adapters_ translate their native protocols into orchestration events. Side effects run in queue-backed _reactors_ that emit _receipts_ when milestones land. Each turn ends with a _checkpoint_, a hidden git ref, so the app can diff and restore.

Full glossary with file links: `docs/reference/encyclopedia.md`

## Where code lives

- `apps/server` - WebSocket, orchestration, providers, checkpointing. Effect-heavy: read `.repos/effect-smol/LLMS.md` and `docs/operations/effect-fn-checklist.md` before writing Effect code.
- `apps/web` - React/Vite UI. `apps/desktop` wraps it, `apps/mobile` is React Native, `apps/marketing` is the site.
- `packages/contracts` - Effect/Schema contracts. Schema only, no runtime logic.
- `packages/shared` - shared runtime utils, subpath exports, no barrel.
- `packages/client-runtime` - client code shared by web and mobile.
- `.repos/` - vendored read-only references. Prefer their patterns over invented ones. Never edit or import from them. Sync with `vpr sync:repos` when bumping the matching dependency.

## Taste

- Complexity belongs at the adapter boundary. Orchestration stays pure, UI stays dumb.
- Inferred types over annotations. `any` is the enemy.
- Comments describe how a thing is used, and move when the code moves. To be used mostly to describe functions, not to annotate every line of behavior.
- Our users drive agents all day and notice a dropped frame, a lying spinner, and a stale label. No continuously repainting animations; they peg the GPU on high-refresh displays.
- If a rule here fights the task in front of you, say so loudly and get a human sign-off before breaking it.

## Additional tips

- Don't verify with browsers or computer use unless the user explicitly agrees or requests it.
- Security is important, but should not be over-indexed on, especially for dev mode/maintainer-only features.

---

# Avi Code overrides

Everything above is upstream's guidance and is kept verbatim so future merges stay clean. The rest
of this file is fork-owned. Where the two disagree, this section wins.

Deliberate divergences from upstream, all because this fork is one developer's daily driver rather
than a 100k-user product:

- **Shipping is the default, not opt-in.** Upstream's "Pull requests" says never open a PR unless
  asked. Here, finished and verified work carries to `main` without asking — see Git Workflow below.
- **Integrated verification is required, not on request.** Upstream's "Verifying" makes the real
  client pass optional and asks permission before driving a browser. Here it is a completion
  requirement for user-visible frontend changes.
- **Confirm a `--share` URL loads before handing it over.** Upstream's "Dev servers" says not to
  open it yourself. This fork has been bitten by browsers refusing otherwise-reachable ports, and a
  successful `curl` does not catch that — so open the origin once in a controlled browser, then send
  the pairing URL.
- **The desktop app is the only surface this fork targets.** See Surface Scope below.

## Surface Scope

Upstream's "Multi-surface" section treats web, desktop, and mobile as three surfaces that all new
features must support. That does not apply here. **Avi Code is a desktop-only fork.** The desktop
app is the single surface Avi uses, and it is the only one fork work has to satisfy.

What that means in practice:

- **Never build, test, or verify `apps/mobile`.** A fork feature that has no mobile equivalent is
  finished, not half-finished. Do not raise mobile as a gap, do not add it to a follow-up list, and
  do not ask whether mobile should be included — the answer is always no.
- **`apps/web` still matters, but as the desktop app's renderer.** `apps/desktop` wraps the web
  bundle, so web UI work _is_ desktop work. Standalone browser use (`app.t3.codes`, `npx t3` in a
  browser) is incidental: don't break it, don't spend effort on it, and don't let a browser-only
  concern block a desktop improvement.
- **Shared packages keep their shape.** `packages/contracts`, `packages/shared`, and
  `packages/client-runtime` are still shared code and still compile for every consumer. Desktop-only
  scope is about where features are _delivered and verified_, not a licence to break mobile's build.
  If a contract change would fail mobile's typecheck, keep it compiling; you just don't have to
  build the mobile feature on top of it.
- **Upstream merges are unaffected.** Mobile code arriving from upstream is merged as-is, same as
  any other upstream directory. This scope governs fork-authored work only.

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
