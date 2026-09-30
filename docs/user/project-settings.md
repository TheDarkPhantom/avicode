# Project overrides

A project can override a few global settings so one repository works differently from the rest.
Find them under **Settings > Avi Code > Project overrides**, pick a project, and change any row.

## What a project can override

- **New threads**: whether new threads start Local or in a new worktree.
- **Start from origin**: whether new worktrees branch from the latest matching branch on origin.
- **Source control writing style**: repository conventions, Conventional Commits, or custom
  instructions for commit messages and pull request text.
- **Text generation model**: the model for thread titles and generated text.
- **Source control writer model**: the model for commit messages, pull request text and branch
  names. "Text generation model" is a real choice here, so a project can drop a dedicated global
  writer model.

Everything else stays global.

## Use default and reset

Each row starts on **Use default**, which shows the current global value and keeps following it
when you change the global setting later. Choosing a value creates an override. To remove one,
pick **Use default** again or press the reset arrow next to the row title. **Clear all for this
project** removes every override for the selected project. The project picker shows how many
overrides each project has.

## Where overrides apply

Overrides are stored with the local server's settings and only cover that server's projects.
New threads, commit and pull request generation, branch naming and thread titles all read the
project's value. A text generation model whose provider is disabled falls back to the global model.
