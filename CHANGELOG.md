# Changelog

Every notable change to Avi Code, newest first.

Avi Code is a fork of [t3code](https://github.com/pingdotgg/t3code). Both codebases move, so this
file keeps the two apart: **Avi Code** sections are changes written in this fork, **Upstream t3code**
sections are changes merged in from `pingdotgg/t3code` and credited to whoever wrote them there. A
sync merge lands dozens of commits at once and would otherwise erase that distinction entirely.

Versions ride the upstream line with an `-avicode.N` suffix, so `0.0.31-avicode.1` is the first Avi
Code release built on t3code `0.0.31`. The `Upstream:` line under each version records the t3code
release the fork was sitting on at the time.

<!--
Format, parsed by apps/web/src/changelog/parseChangelog.ts and rendered at /changelog:

  ## <version> — <YYYY-MM-DD>        (or `## Unreleased`, with no date)

  Upstream: t3code <version>

  ### Avi Code                       (or `### Upstream t3code`)

  - <summary> (#<pr>)                (upstream entries add ` — <Author>`)

Add every user-visible change to Unreleased as it lands; the release bump renames the heading.
-->

## Unreleased

Upstream: t3code 0.0.31

### Avi Code

- feat(web): read the changelog from the sidebar, with fork and upstream changes kept apart (#53)
- ci: publish the Windows installer from the packaging guardrail (#51)
- feat: /btw side questions on a discarded conversation fork (#50)

## 0.0.31-avicode.1 — 2026-07-30

Upstream: t3code 0.0.31

### Avi Code

- feat(web): pin threads and projects to the top of the sidebar (#45)
- feat(web): offer five notification sounds instead of one (#48)
- feat(web): tint the whole thread row in its status color (#47)
- feat(web): add plan-mode and worktree-icon toggles to Avi Code settings (#44)
- feat(web): make the chat column width configurable (#46)
- fix(server): enforce read-only plan turns in the Claude adapter (#43)
- feat: edit and fork earlier Codex messages (#42)
- fix(server): settle orphaned "running" sessions on startup (#41)
- fix(attachments): raise document and input character caps (#40)
- feat(web): show repository icons on flat thread rows (#39)
- feat(web): add a Shortcuts tab to the Avi Code settings page (#38)
- fix(web,server): surface provider badges in the picker and shorten thread titles (#37)
- docs: expand CLAUDE.md beyond the AGENTS.md import (#36)
- fix(web): keep the dictation websocket connected (#35)

### Upstream t3code

Merged in [#49](https://github.com/TheDarkPhantom/avicode/pull/49), covering t3code 0.0.29 through
0.0.31.

- fix(web): show server update progress through reconnect (#4903) — Theo Browne
- feat(web): regenerate thread titles from sidebar (#4810) — Theo Browne
- feat(web): pasting a huge screenshot now compresses it instead of erroring (#4967) — Theo Browne
- perf(mobile): reconnect environments immediately on resume (#4878) — Theo Browne
- fix(web): keep worktree default when switching a draft's machine (#4964) — Theo Browne
- fix(mobile): stop long iOS threads from jumping while scrolling up (#4867) — Theo Browne
- fix(mobile): support dragged images in the composer (#4953) — Theo Browne
- docs: seed worktrees with a copy of real userdata instead of banning it (#4949) — Theo Browne
- fix(web): show Codex fast mode as a bolt (#4947) — Theo Browne
- perf(mobile): sends respond instantly, thread opens stop freezing (#4882) — Theo Browne
- fix(mobile): stop shared content errors in Personal Team builds (#4943) — Theo Browne
- fix(connect): suggest a serve command that matches how you ran connect (#4897) — Theo Browne
- fix(web): align remote server update action (#4731) — Wout Stiens
- docs: link iOS and Android app store downloads (#4902) — Theo Browne
- fix(composer): hide default Codex service tier (#4784) — Max Katz
- fix(clients): disable add project while disconnected (#4834) — Wout Stiens
- fix(web): settle button now works on hover, not just right-click (#4905) — Theo Browne
- fix(web): restore sidebar v2 thread actions and terminal icon (#4712) — Jono Kemball
- fix(mobile): reduce thread feed scroll jank (#4874) — Gabriel De Andrade
- fix(web): remember the rendered-markdown choice across threads (#4853) — Simon Doba
- fix(web): editable file focus and live syntax highlighting (#3979) — Jake Leventhal
- fix(git): disable external diff for review diff previews (#4854) — ohbentos
- perf(server): merge staged and unstaged numstat into a single diff (#4843) — Utkarsh Patil
- fix(server): detect repositories after initialization (#4848) — Wout Stiens
- perf(server): reduce idle work and disk churn with native resource diagnostics (#2679) — Julius Marminge
- fix(web): preserve the thread shell while detail loads (#4830) — Julius Marminge
- chore: update model version from claude-opus-4-8 to claude-opus-5 (#4832) — Julius Marminge
- build(desktop): reduce installed app size by ~300MB (#4824) — wukko
- fix(web): simplify files panel header (#4828) — Julius Marminge
- fix(desktop): restore Connect sign-in (#4809) — Alex
- fix(web): fix Connect sign-in settings label (#4806) — Julius Marminge
- feat: remove Connect waitlist and add GA announcement tooling (#4691) — Julius Marminge
- refactor(server): use native HTTP compression streams (#4798) — Julius Marminge
- fix(mobile): defer filesystem navigation (#4799) — Julius Marminge
- refactor(client): share filesystem browse navigation (#4797) — Julius Marminge
- fix(release): skip scripts during Vercel installs (#4796) — Theo Browne
- fix(web): defer command palette filesystem navigation (#2109) — Julius Marminge
- perf(server): trim stale context-window rows and drop dead replay RPC (#4791) — Theo Browne
- fix(server): fix Git ref refresh resource storms (#4727) — Julius Marminge
- fix(web): stashed prompts now survive switching providers (#4787) — Theo Browne
- perf(server): gzip large thread snapshots (#4788) — Theo Browne
- fix(web): prevent sidebar row labels from truncating (#4789) — Julius Marminge
- docs: overhaul agent guidance (#4782) — Theo Browne

## 0.0.29-avicode.1 — 2026-07-29

Upstream: t3code 0.0.29

The fork's first numbered release. Everything below was written in this fork on top of t3code
0.0.29; no upstream sync had happened yet.

### Avi Code

- chore: adopt the `-avicode.N` version suffix across desktop, server, web, and contracts (#34)
- fix(web): drop the settled banner from the composer (#33)
- feat(server): record fork lineage when a thread branches (#32)
- feat: dictate prompts into the composer with Deepgram (#31)
- feat(web): add selectable colour themes (#30)
- fix: stabilize environment connections (#29)
- feat(server): serialize repository-mutating git workflows per repository (#28)
- docs: add git, shipping, and planning conventions to AGENTS.md (#26)
- feat(web): add a flat, activity-ordered sidebar thread list (#17)
- fix(server): move editor discovery off the config path (#15)
- feat(server): isolate provider credentials by project (#25)
- fix(server): fix native thread titles for timelogging (#24)
- feat(web): show provider badges in the chat list (#23)
- feat: add cross-thread context references (#22)
- fix(server): audit provider auth transitions (#21)
- feat(web): show the changed file count (#19)
- fix(web): show exhausted quota as empty (#20)
- feat(web): sound and a reliable label when a chat needs you (#18)
- feat(web): add Codex plan review handoff (#16)
- feat(web): unarchive threads from the project sidebar (#14)
- feat(web): show plan allowance as a draining green-to-red bar (#13)
- fix: make the Claude plan-quota read actually run (#12)
- feat: consolidate local Avi Code improvements (#11)
- feat: track plan quota and token usage per provider instance (#10)
- fix: fix disconnected message delivery and reconnect polling (#9)
- feat(web): pin the current turn prompt while scrolling (#8)
- fix(web): preserve timeline position after manual scrolling (#7)
- feat: complete Advisor Avi branding as Avi Code (#6)
- fix: keep Avi Code distribution manual-only (#5)
- feat: establish the Avi Code product foundation (#4)
- fix: run the guardrail smoke test in Xvfb (#3)
- fix: build desktop before the guardrail smoke test (#2)
- ci: add guarded upstream synchronization (#1)
