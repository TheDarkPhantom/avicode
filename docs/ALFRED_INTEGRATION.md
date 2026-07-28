# ALFRED integration

AviCode exposes metadata only:

- Codex originator `avicode_desktop`.
- Native title `<repository> — <thread title> — AviCode`.
- Database `~/.avicode/userdata/state.sqlite`.

**Private window titles** under Appearance reduces the title to `AviCode`. It defaults off so
ActivityWatch and ALFRED can match foreground attention. ALFRED must distinguish
`avicode_desktop` from legacy `t3code_desktop`, exclude subagents from foreground claims, and
never export prompts, responses, or attachment contents.
