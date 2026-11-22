# Project actions

Project actions are named commands that run in an Avi Code terminal. Configure them from the
actions menu for a project. An action can include a preview URL and can open that URL in the
desktop browser when you launch it manually.

## New worktrees

One action can be marked **Run automatically on worktree creation**. That project-specific action
always owns worktree setup.

The Avi Code settings page also has **Start a dev server for new worktrees**. When enabled, a new
chat worktree runs the project's primary action only when no action is explicitly marked for
worktree creation. Avi Code runs at most one action. Local chats and existing worktrees are not
affected.

The browser remains closed unless the action's preview settings open it. Once the command binds a
port, Avi Code attributes that server to the new worktree so its sidebar and browser controls can
open the correct server without reusing one from a sibling worktree.

## Local servers

With no page loaded, the desktop browser lists the local servers that a thread's terminal or its
Claude agent started, labelled **Terminal** or **Agent**. A server the agent started stays listed
after the agent's session ends. Select a server to open it. Hover a listed server and choose
**Stop** to end the job that runs it; the terminal, the agent, and Avi Code keep running. A server
the agent started from a shell that has already exited is not attributed to the agent. Stop needs
terminal access to the environment and is available on Windows only.

## Browser screenshots

In the desktop browser, **Screenshot** saves the current viewport and attaches the PNG to the
current chat draft. It does not send the message. The confirmation still lets you copy the image,
copy its saved path, or reveal the file in Explorer or Finder.
