# Threads without a project

A thread does not need a project. Use one for quick jobs that have no repository, like converting a
batch of images or drafting a script.

## Start one

- Click **or start without a project** under a new thread's heading.
- Pick **No project** from the project menu in that heading.
- Pick **No project** from **New thread in...** in the command palette, or run **New thread without
  a project**.
- Press `mod+alt+n` (`chat.newWithoutProject`).
- With no projects yet, click **Start without a project** on the welcome screen or in the sidebar.

To move a draft into a real project, pick the project in the heading.

## Where the files go

Each thread gets its own folder under `scratch` in your data directory, named after its date, the
first words of its first message, and a short id. For example:
`scratch/2026-09-25-convert-these-pngs-to-webp-a1b2c3d4`.

- Deleting the thread keeps its folder, so the agent's files stay until you delete them.
- Branch, worktree, diff, and Git buttons stay hidden, because these folders are not Git
  repositories.

## When it is unavailable

The option is hidden when the data directory itself sits inside a Git checkout, because the scratch
folders would inherit that repository's status. Dev servers that keep their data inside a worktree
hit this on purpose.
