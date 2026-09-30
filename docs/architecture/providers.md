# Provider architecture

The web app communicates with the server via WebSocket using a simple JSON-RPC-style protocol:

- **Request/Response**: `{ id, method, params }` → `{ id, result }` or `{ id, error }`
- **Push events**: typed envelopes with `channel`, `sequence` (monotonic per connection), and channel-specific `data`

Push channels: `server.welcome`, `server.configUpdated`, `terminal.event`, `orchestration.domainEvent`. Payloads are schema-validated at the transport boundary (`wsTransport.ts`). Decode failures produce structured `WsDecodeDiagnostic` with `code`, `reason`, and path info.

Methods mirror the `NativeApi` interface defined in `@t3tools/contracts`:

- `providers.startSession`, `providers.sendTurn`, `providers.interruptTurn`
- `providers.respondToRequest`, `providers.stopSession`
- `shell.openInEditor`, `server.getConfig`

Codex is the only implemented provider. `claudeCode` is reserved in contracts/UI.

## Client transport

`wsTransport.ts` manages connection state: `connecting` → `open` → `reconnecting` → `closed` → `disposed`. Outbound requests are queued while disconnected and flushed on reconnect. Inbound pushes are decoded and validated at the boundary, then cached per channel. Subscribers can opt into `replayLatest` to receive the last push on subscribe.

## Server-side orchestration layers

Provider runtime events flow through queue-based workers:

1. **ProviderRuntimeIngestion** — consumes provider runtime streams, emits orchestration commands
2. **ProviderCommandReactor** — reacts to orchestration intent events, dispatches provider calls
3. **CheckpointReactor** — captures git checkpoints on turn start/complete, publishes runtime receipts

All three use `DrainableWorker` internally and expose `drain()` for deterministic test synchronization.

## Attachment access

The server stores attachments in its attachment directory, outside the project workspace. Clients
either send image bytes inline or upload first: `attachments.createUploadUrl` returns a signed,
ten-minute upload URL and a `pending-…` attachment id, the client POSTs the bytes there, and the
turn references the pending id. The Normalizer copies the pending upload to a thread-owned id when
the turn is dispatched. Generic file ids carry their extension (`<thread>-<uuid>-pdf`), which is how
the server finds `<id>.pdf` on disk and serves it as a download.

`ProviderService` adds the absolute path of each attachment to the turn text, then passes every
attachment to the provider adapter. Each adapter decides what its provider ingests natively:

- Codex, Claude, Cursor, and Grok send images as native image inputs and skip everything else. For
  these providers, generic files reach the agent only as file paths in the turn text.
- OpenCode sends PNG/JPEG/GIF/WebP images, text files, and PDFs up to 20 MB as native file parts
  with their real mime type. Everything else (ZIP and other binaries, image formats model APIs
  reject, oversized files) falls back to the file path in the turn text, like the other providers.
- Documents (the fork's PDF/TXT/Markdown/CSV/JSON/DOCX attachments) are never sent natively by any
  adapter. Their extracted text is already inlined into the turn text by the Normalizer. When the
  client uploaded the original too, the document id carries its extension like a file id and the
  path line points at the original; older documents point at their extracted `.txt` and say so.

Claude receives the attachment directory as an allowed additional directory. Codex keeps its
configured sandbox policy, so access depends on that policy and the selected runtime mode. OpenCode
allows all paths in full-access mode and requests approval for directories outside the workspace in
restricted modes. Cursor and Grok use their own provider permission rules.

Clients and servers from before file attachments cannot decode messages that contain them. Do not
run an older server against state that contains file attachments: replay decodes each persisted
event before projection, so one file-bearing event can stop the whole environment from starting.
Upstream also tolerates attachment types from newer builds through `ChatUnknownAttachment`. The
fork defines that schema but keeps it out of `ChatAttachment` until the web client reads
attachments through type guards, because its open `type: string` stops literal narrowing.
