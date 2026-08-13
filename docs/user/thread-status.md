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
restart. Window focus, unlock, and automatic route restore do not mark a thread read. Opening a
different thread from the sidebar or command palette does.

## Plan actions

Implement stays in the composer after a plan finishes. Discard hides plan actions but keeps the
plan card and data. Use **Restore plan** from the card menu to make it actionable again.
