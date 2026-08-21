# Thread status

Sidebar status shows work that still needs attention. Text and dot modes use the same state. The
label display setting only changes how that state looks.

## Status rules

- **Working** means a provider turn is starting or running.
- **Plan Ready** means plan mode has a saved plan awaiting refine, implement, or discard.
- **Completed** means the latest finished turn has not been opened on this client.
- Approval, input, failure, and resume states take priority over these labels.

Turn and plan state lives on the server. Locking Windows, reconnecting, reloading, or server idle
cleanup does not remove it. A migration repairs historical threads whose latest-turn pointer was
cleared by old idle cleanup.

## Read state

Completed read state is local to each client. It is saved at once and survives reload or app
restart. Window focus, unlock, and automatic route restore alone do not mark a thread read. Opening a
different thread from the sidebar or command palette does. Reading a thread to the bottom also marks
it read: when the open thread is scrolled to the bottom and the window is focused, the Completed
status clears, both when the turn finishes while you watch and when you scroll to the end afterward.

## Plan actions

Implement stays in the composer after a plan finishes. Discard hides plan actions but keeps the
plan card and data. Use **Restore plan** from the card menu to make it actionable again.

## Question answers

When an agent asks several questions, each thread keeps its chosen options, custom text, and current
question on this client. Switching threads, reloading, or restarting Avi Code does not erase the
unfinished answers. The saved draft clears after the question is answered, dismissed, or expires.
