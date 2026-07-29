# ALFRED integration

AviCode exposes metadata only:

- Codex originator `avicode_desktop`.
- Native title `<repository> — <thread title> — Avi Code`.
- Database `~/.avicode/userdata/state.sqlite`.

**Private window titles** under Settings → Avi Code reduces the title to `Avi Code`. It defaults off so
ActivityWatch and ALFRED can match foreground attention. ALFRED must distinguish
`avicode_desktop` from legacy `t3code_desktop`, exclude subagents from foreground claims, and
never export prompts, responses, or attachment contents. When privacy mode is enabled or metadata
is temporarily unavailable, ALFRED records generic `Vibecoding` foreground time without assigning
it to a repository or thread.
