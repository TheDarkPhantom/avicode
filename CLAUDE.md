@AGENTS.md

Fork rules are in the "Avi Code overrides" section at the bottom of AGENTS.md. They win over the
upstream text above them.

- Node `^24.13.1` is required. On Windows, source `. "$env:USERPROFILE\.vite-plus\env.ps1"` in each
  PowerShell session, or `. ~/.vite-plus/env` in Git Bash, before running `vp`.
- **Never recursive-delete a worktree on Windows.** Use `git worktree remove`. Some worktrees contain
  junctions into `~/.avicode`, and a recursive delete once followed one and wiped
  `~/.avicode/userdata`.
