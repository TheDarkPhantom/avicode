# Changelog

What changed in Avi Code 2, newest first, written as what it does for you rather than what moved in
the code.

Avi Code 2 is a fork of [T3 Code](https://github.com/pingdotgg/t3code). Both codebases move, so this
file keeps the two apart. **Avi Code** sections are changes written in this fork. **Upstream
t3code** sections are changes merged in from `pingdotgg/t3code`, credited to whoever wrote them
there, because a sync merge lands dozens of commits at once and would otherwise erase the
difference.

Versions ride the upstream line with an `-avicode.N` suffix, so `0.1.12-avicode.1` is the first Avi
Code 2 release built on t3code `0.1.12`. The `Upstream:` line under each version records the t3code
release the fork was sitting on at the time.

<!--
Format, parsed by apps/web/src/changelog/parseChangelog.ts and rendered at /changelog:

  ## <version> (<YYYY-MM-DD>)        or `## Unreleased`, with no date

  Upstream: t3code <version>

  ### Avi Code                       or `### Upstream t3code`

  - <what you can now do, or what stopped going wrong> (#<pr>)
  - <same, for upstream> (#<pr> by <Author>)

Entries may wrap onto further indented lines.

House style: one short sentence of at most 100 characters, present tense, no em or en dashes.
Write the outcome, not the implementation. "Pin the threads you keep coming back to" beats
"feat(web): add sidebar pinning". The reader uses Avi Code and should not need to know what a
projector or an adapter is. Name the surface only when it narrows who is affected ("On mobile,
..."). Commit-style detail belongs in the PR, which every entry already links to.

Add every user-visible change to Unreleased as it lands. The release bump renames the heading.
-->

## Unreleased

Upstream: t3code 0.1.12

### Avi Code

- Ctrl+W settles the open thread instead of archiving it, and Ctrl+Shift+T un-settles it (#343)
- Threads settled for 14 days archive themselves; change or turn off in Settings > Avi Code (#343)
- Avi Code 2 starts from upstream T3 Code 0.1.12 (#307)
- Threads in the sidebar sit nearly flush left instead of indented under the project name (#340)
- Keep repository and thread names out of the window title in Settings > Avi Code (#321)
- The first start brings over your Avi Code threads, providers and settings (#319)
- Usage analytics stay off unless you opt in (#316)
- The app uses the Avi Code icon and name everywhere (#314)
- Menus, dialogs and messages say Avi Code 2 instead of T3 Code in every language (#322)
- Open a project's folder in File Explorer from its right-click menu in the sidebar (#324)
- Keep the sites you open often as bookmarks on the built-in browser's new tab page (#326)
- Start every new chat in plan mode with a toggle in Settings > Avi Code (#325)
- Pick the Oxblood, Midnight, Forest, Violet or Graphite theme in light or dark (#327)
- Send saved messages in one click with chips under the message box (#329)
- Pick a different sound for when an agent needs you and when it finishes (#328)
- Sign in to each Claude account from its provider settings instead of a terminal command (#330)
- See token usage and cost per repository and account on the Usage page (#332)
- Ctrl+W archives the open thread once no terminal or panel tab is left to close (#331)
- Ctrl+Shift+T reopens your last archived threads once no closed tab is left to reopen (#331)
- Keep the thread details card closed in every chat with a toggle in Settings > Avi Code (#338)
- In the boring sidebar, group projects into named folders you can collapse, hide and reorder (#333)
- Keep chats that need you in view under a collapsed sidebar folder with a new setting (#333)
- Server messages, sign-in pages and setting help say Avi Code 2 instead of T3 Code (#334)
- The sidebar, sign-in pages and chat rows show the Avi Code icon and name, not the T3 logo (#336)
- A new Avi Code 2 icon that stays sharp on the Windows taskbar and in browser tabs (#339)
- Hover a boring sidebar folder to reopen that project's settled and archived threads (#342)
