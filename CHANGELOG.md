# Changelog

What changed in Avi Code, newest first, written as what it does for you rather than what moved in
the code.

Avi Code is a fork of [t3code](https://github.com/pingdotgg/t3code). Both codebases move, so this
file keeps the two apart. **Avi Code** sections are changes written in this fork. **Upstream
t3code** sections are changes merged in from `pingdotgg/t3code`, credited to whoever wrote them
there, because a sync merge lands dozens of commits at once and would otherwise erase the
difference.

Versions ride the upstream line with an `-avicode.N` suffix, so `0.0.31-avicode.1` is the first Avi
Code release built on t3code `0.0.31`. The `Upstream:` line under each version records the t3code
release the fork was sitting on at the time.

<!--
Format, parsed by apps/web/src/changelog/parseChangelog.ts and rendered at /changelog:

  ## <version> (<YYYY-MM-DD>)        or `## Unreleased`, with no date

  Upstream: t3code <version>

  ### Avi Code                       or `### Upstream t3code`

  - <what you can now do, or what stopped going wrong> (#<pr>)
  - <same, for upstream> (#<pr> by <Author>)

Entries may wrap onto further indented lines.

House style: one short sentence, present tense, no em dashes. Write the outcome, not the
implementation. "Pin the threads you keep coming back to" beats "feat(web): add sidebar pinning".
The reader uses Avi Code and should not need to know what a projector or an adapter is. Name the
surface only when it narrows who is affected ("On mobile, ..."). Commit-style detail belongs in the
PR, which every entry already links to.

Add every user-visible change to Unreleased as it lands. The release bump renames the heading.
-->

## Unreleased

Upstream: t3code 0.0.31

### Avi Code

- The pinned prompt moves aside instead of covering the next message as you scroll (#76)
- Dictation works with any Deepgram key, not only ones allowed to mint tokens (#75)
- Dictation says why it stopped instead of switching itself off without a word (#74)
- The window title privacy setting says what it hides instead of naming an unfamiliar tool (#73)
- Send any earlier message again from its hover actions to rerun that prompt in the thread (#56)
- Open a finished chat at the top of its last answer instead of the bottom (#58)
- Agents get the toolchain traps that cost real debugging time written down (#69)
- Ctrl+W closes the open thread instead of quitting the app (#55)
- Merge a project's ready threads one at a time from the sidebar (#64)
- The repository's auto merge policy now reaches the server (#62)
- Unarchiving a thread from the sidebar opens it (#59)
- Escape leaves an agent's question and hands the composer back (#57)
- Pick how the agent talks to you for one turn, from the composer (#68)
- The composer's model button shows the model without the vendor name (#65)
- Fork documentation scopes Avi Code to the desktop app (#63)
- Reference another thread from the `@` menu instead of a separate button (#66)
- Turn the sidebar's pull request indicator off if you do not want it (#61)
- Planning docs track upstream orchestration V2 and the deferred queue work (#60)
- The thread reference picker stops opening clipped behind the composer (#54)
- See what changed in each version, and whether it came from Avi Code or upstream (#53)
- Agents get refreshed repo guidance for the v0.0.31 upstream merge (#52)
- Every packaging run leaves a downloadable Windows installer (#51)
- Ask a side question with `/btw` without derailing the thread (#50)

## 0.0.31-avicode.1 (2026-07-30)

Upstream: t3code 0.0.31

### Avi Code

- Pin the threads and projects you keep returning to so they stay at the top (#45)
- Five notification sounds to choose from instead of one (#48)
- Thread rows show their status as a colour across the whole row (#47)
- Turn plan mode and worktree icons on or off yourself (#44)
- Set how wide the chat column is (#46)
- Claude stops editing files while it is planning (#43)
- Edit an earlier message and branch the thread from there (#42)
- Threads stop hanging on "running" after a crash or restart (#41)
- Longer documents and prompts go through without hitting a cap (#40)
- Thread rows show which repository they belong to (#39)
- A Shortcuts tab lists the keyboard shortcuts you can use (#38)
- Provider and model show in the picker, and titles fit the sidebar (#37)
- Agents working on Avi Code get clearer guidance about the codebase (#36)
- Voice dictation stays connected instead of dropping (#35)

### Upstream t3code

Merged in [#49](https://github.com/TheDarkPhantom/avicode/pull/49), covering t3code 0.0.29 through
0.0.31.

- A server update shows progress while the app reconnects (#4903 by Theo Browne)
- Regenerate a thread title from the sidebar (#4810 by Theo Browne)
- Pasting a large screenshot compresses it instead of failing (#4967 by Theo Browne)
- On mobile, environments reconnect as soon as you pick up your phone (#4878 by Theo Browne)
- Switching a draft's machine keeps your worktree choice (#4964 by Theo Browne)
- On iOS, long threads stop jumping while you scroll back (#4867 by Theo Browne)
- On mobile, dragging an image into the composer attaches it (#4953 by Theo Browne)
- Clearer guidance for contributors seeding realistic test data (#4949 by Theo Browne)
- Codex fast mode is marked with a bolt (#4947 by Theo Browne)
- On mobile, sending responds instantly and threads stop freezing (#4882 by Theo Browne)
- On mobile, sharing into the app stops erroring on Personal Team builds (#4943 by Theo Browne)
- Connect suggests a serve command that matches how you started it (#4897 by Theo Browne)
- Updating a remote server works like updating a local one (#4731 by Wout Stiens)
- The docs link straight to the iOS and Android downloads (#4902 by Theo Browne)
- The composer stops showing Codex's default tier as your choice (#4784 by Max Katz)
- Adding a project is disabled while you are disconnected (#4834 by Wout Stiens)
- The settle button works on hover, not just right-click (#4905 by Theo Browne)
- Thread actions and the terminal icon are back in the new sidebar (#4712 by Jono Kemball)
- On mobile, the thread feed scrolls more smoothly (#4874 by Gabriel De Andrade)
- Your rendered-markdown preference sticks across threads (#4853 by Simon Doba)
- Editing a file keeps focus and highlights syntax as you type (#3979 by Jake Leventhal)
- Diff previews render in the app, not in your external diff tool (#4854 by ohbentos)
- Change counts for a repository come back faster (#4843 by Utkarsh Patil)
- A repository you just created is picked up without a restart (#4848 by Wout Stiens)
- The app uses less CPU and disk while you are idle (#2679 by Julius Marminge)
- Opening a thread shows its frame immediately, not a blank screen (#4830 by Julius Marminge)
- Claude Opus 5 is available as a model (#4832 by Julius Marminge)
- The desktop app installs about 300MB smaller (#4824 by wukko)
- The files panel header is simpler to scan (#4828 by Julius Marminge)
- Signing in to Connect from the desktop app works again (#4809 by Alex)
- The Connect sign-in setting is labelled correctly (#4806 by Julius Marminge)
- Connect is generally available, with no waitlist (#4691 by Julius Marminge)
- Data moves between app and server with less overhead (#4798 by Julius Marminge)
- On mobile, browsing the filesystem stops stalling the screen (#4799 by Julius Marminge)
- File browsing works the same on web and mobile (#4797 by Julius Marminge)
- The hosted web app deploys reliably (#4796 by Theo Browne)
- The command palette stays responsive while listing directories (#2109 by Julius Marminge)
- The server keeps less stale data around (#4791 by Theo Browne)
- Repositories with many branches stop causing CPU spikes (#4727 by Julius Marminge)
- A prompt you have typed survives switching providers (#4787 by Theo Browne)
- Large threads load faster (#4788 by Theo Browne)
- Sidebar labels stop getting cut off (#4789 by Julius Marminge)
- Coding agents get better guidance for working in the codebase (#4782 by Theo Browne)

## 0.0.29-avicode.1 (2026-07-29)

Upstream: t3code 0.0.29

The fork's first numbered release. Everything below was written in this fork on top of t3code
0.0.29, before any upstream sync.

### Avi Code

- Versions carry an `-avicode.N` suffix, so the upstream base is obvious (#34)
- The composer stops showing a settled banner that was in the way (#33)
- A branched thread shows which thread it came from (#32)
- Dictate a prompt into the composer with your voice (#31)
- Pick a colour theme: Oxblood, Midnight, Forest, Violet, or Graphite (#30)
- Environments stay connected instead of dropping out (#29)
- Two agents in one repository stop tripping over each other's git work (#28)
- Agents contributing to Avi Code follow explicit git and planning conventions (#26)
- A flat sidebar list ordered by recent activity (#17)
- Startup stops stalling while Avi Code looks for your editor (#15)
- Scope provider credentials per project (#25)
- Window titles carry repository and thread, so time trackers attribute work correctly (#24)
- Each chat shows which provider it runs on (#23)
- Reference another thread's transcript as context (#22)
- Provider sign-ins and sign-outs are recorded with timestamps (#21)
- See how many files changed, and click through to them (#19)
- An exhausted plan quota reads as empty, not full (#20)
- A sound and a clear label when a chat is waiting on you (#18)
- Review a Codex plan and hand it off to be implemented (#16)
- Unarchive a thread from the project sidebar (#14)
- Your plan allowance shows as a bar draining green to red (#13)
- The Claude plan quota is read, so the meter reflects what is left (#12)
- A batch of quality-of-life fixes from daily use (#11)
- See plan quota and token usage per provider account (#10)
- Messages sent while disconnected are delivered on reconnect (#9)
- The current turn's prompt stays pinned while you scroll (#8)
- Scrolling back through a thread stops yanking you to the bottom (#7)
- Avi Code has its own name, icon, and identity throughout (#6)
- Releases go out only when you trigger them (#5)
- Avi Code runs as its own app with its own data, beside t3code (#4)
- The packaging check runs headlessly in CI (#3)
- The packaging check builds the app first, so it tests a real build (#2)
- Upstream changes come in through a guarded, reviewed process (#1)
