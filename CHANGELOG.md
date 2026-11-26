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

- Avi Code 2 starts from upstream T3 Code 0.1.12 (#307)
- The app uses the Avi Code icon and name everywhere (#314)
