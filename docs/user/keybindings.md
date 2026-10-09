# Keybindings

T3 Code reads keybindings from:

- `~/.t3/keybindings.json`

The file must be a JSON array of rules:

```json
[
  { "key": "mod+g", "command": "terminal.toggle" },
  { "key": "mod+shift+g", "command": "terminal.new", "when": "terminalFocus" }
]
```

See the full schema for more details: [`packages/contracts/src/keybindings.ts`](../../packages/contracts/src/keybindings.ts)

## Defaults

```json
[
  { "key": "mod+[", "command": "navigation.back", "when": "!terminalFocus" },
  { "key": "mod+]", "command": "navigation.forward", "when": "!terminalFocus" },
  {
    "key": "alt+arrowleft",
    "command": "navigation.back",
    "when": "!terminalFocus && !editableFocus"
  },
  {
    "key": "alt+arrowright",
    "command": "navigation.forward",
    "when": "!terminalFocus && !editableFocus"
  },
  { "key": "mod+j", "command": "terminal.toggle" },
  { "key": "mod+d", "command": "terminal.split", "when": "terminalFocus" },
  { "key": "mod+n", "command": "terminal.new", "when": "terminalFocus" },
  { "key": "mod+w", "command": "terminal.close", "when": "terminalFocus" },
  { "key": "mod+w", "command": "thread.archive", "when": "!terminalFocus" },
  { "key": "mod+shift+j", "command": "preview.toggle" },
  { "key": "mod+r", "command": "preview.refresh", "when": "previewFocus" },
  { "key": "mod+l", "command": "preview.focusUrl", "when": "previewFocus" },
  { "key": "mod+=", "command": "preview.zoomIn", "when": "previewFocus" },
  { "key": "mod+-", "command": "preview.zoomOut", "when": "previewFocus" },
  { "key": "mod+0", "command": "preview.resetZoom", "when": "previewFocus" },
  { "key": "mod+k", "command": "commandPalette.toggle", "when": "!terminalFocus" },
  { "key": "mod+f", "command": "find.toggle", "when": "!terminalFocus" },
  { "key": "mod+n", "command": "chat.new", "when": "!terminalFocus" },
  { "key": "mod+shift+o", "command": "chat.new", "when": "!terminalFocus" },
  { "key": "mod+shift+n", "command": "chat.newLocal", "when": "!terminalFocus" },
  { "key": "mod+o", "command": "editor.openFavorite" },
  { "key": "mod+shift+e", "command": "thread.settle", "when": "!terminalFocus" }
]
```

For most up to date defaults, see [`DEFAULT_KEYBINDINGS` in `apps/server/src/keybindings.ts`](../../apps/server/src/keybindings.ts)

## Composer keys

These keys are built into the composer and are not configurable.

- `mod+enter` in a new thread sends the first message and starts that thread in the background.
  You land on a fresh new-thread draft with the same workspace mode and base branch, and a toast
  offers **Open** for the thread that started. **New worktree** stays selected, but the fresh draft
  does not reuse the worktree created for the thread that just started. In a thread that has
  already started, `mod+enter` is a plain send. Turn this off in Settings → Avi Code → Composer to
  make `mod+enter` a plain send everywhere.
- `mod+alt+enter` in a thread that has already started sends, keeps that thread running, and
  opens a fresh new-thread draft in the same project. If the message waits behind the running turn
  or for a reconnect, you stay on the thread so it can send. In a new thread it does the same as
  `mod+enter`.
- `ArrowUp` in an empty composer brings back the last prompt you sent in this thread. Press it
  again to go further back, and `ArrowDown` to come forward. Moving forward past the newest prompt
  clears the composer. Only the text you typed comes back: attachments, attached documents,
  terminal and element context, review comments, and the ultrathink prefix are left out, and
  app-composed sends such as plan implementation are skipped. A composer holding an attachment or
  other context does not count as empty. With text in the composer the arrows move the caret as
  usual; recall only takes over while the text is an unedited recalled prompt and the caret is on
  its first visual line (`ArrowUp`) or last visual line (`ArrowDown`). Open menus, approvals, and
  pending questions take the arrows first.

## Configuration

### Rule Shape

Each entry supports:

- `key` (required): shortcut string, like `mod+j`, `ctrl+k`, `cmd+shift+d`
- `command` (required): action ID
- `when` (optional): boolean expression controlling when the shortcut is active

Invalid rules are ignored. Invalid config files are ignored. Warnings are logged by the server.

### Available Commands

- `navigation.back` / `navigation.forward`: move through the pages you have visited, like a
  browser's back and forward buttons. `mod+[` and `mod+]` work outside the terminal; `alt+left` and
  `alt+right` also skip text fields. In the desktop app the mouse's back and forward buttons do the
  same, unless Settings → Avi Code has them step through sidebar threads instead.
- `terminal.toggle`: open/close terminal drawer
- `terminal.split`: split terminal (in focused terminal context by default)
- `terminal.new`: create new terminal (in focused terminal context by default)
- `terminal.close`: close/kill the focused terminal (in focused terminal context by default)
- `thread.archive`: close the open thread by archiving it, then land on a fresh draft in the same
  project (outside a focused terminal by default). Reversible from Settings → Archived. On desktop
  this takes over `mod+w` from the native Close Window item, which moves to `mod+shift+w`.
- `thread.settle`: settle the open thread, or restore it when it is already settled (outside a
  focused terminal by default). Settling shows an Undo, also reachable with `mod+z`. Upstream uses
  `mod+shift+s`, which here toggles the preview split.
- `preview.toggle`: open/close the in-app browser preview panel (desktop app only)
- `preview.refresh`: reload the active preview tab (in focused preview context by default)
- `preview.focusUrl`: focus the URL input of the preview panel (in focused preview context by default)
- `preview.zoomIn`: zoom the preview viewport in one step (in focused preview context by default)
- `preview.zoomOut`: zoom the preview viewport out one step (in focused preview context by default)
- `preview.resetZoom`: reset the preview zoom to 100% (in focused preview context by default)
- `commandPalette.toggle`: open or close the global command palette
- `find.toggle`: open the find bar for the current thread, searching messages, plans, and tool calls
- `find.next` / `find.previous`: step to the next or previous match (Enter and Shift+Enter in the bar)
- `chat.new`: create a new chat thread preserving the active thread's branch/worktree state
- `chat.newLocal`: create a new chat thread for the active project in a new environment (local/worktree determined by app settings (default `local`))
- `editor.openFavorite`: open current project/worktree in the last-used editor
- `script.{id}.run`: run a project script by id (for example `script.test.run`)

### Key Syntax

Supported modifiers:

- `mod` (`cmd` on macOS, `ctrl` on non-macOS)
- `cmd` / `meta`
- `ctrl` / `control`
- `shift`
- `alt` / `option`

Examples:

- `mod+j`
- `mod+shift+d`
- `ctrl+l`
- `cmd+k`

### `when` Conditions

Currently available context keys:

- `terminalFocus`
- `terminalOpen`
- `previewFocus`
- `previewOpen`
- `editableFocus` (a text field or the composer has focus)

Supported operators:

- `!` (not)
- `&&` (and)
- `||` (or)
- parentheses: `(` `)`

Examples:

- `"when": "terminalFocus"`
- `"when": "terminalOpen && !terminalFocus"`
- `"when": "terminalFocus || terminalOpen"`

Unknown condition keys evaluate to `false`.

### Precedence

- Rules are evaluated in array order.
- For a key event, the last rule where both `key` matches and `when` evaluates to `true` wins.
- That means precedence is across commands, not only within the same command.
