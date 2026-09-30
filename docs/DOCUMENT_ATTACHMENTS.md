# Document attachments

AviCode accepts images plus PDF, DOCX, TXT, CSV, JSON, `.md`, and `.markdown` by paste,
drag-and-drop, or the composer's paperclip picker. Other files (ZIP and the like) attach as generic
files; see [docs/user/attachments.md](user/attachments.md).

Extraction is local. TXT/Markdown/CSV use UTF-8; PDF uses PDF.js. Sanitized text reaches every provider
as a delimited context. The original goes only to your own server, never to an AviCode service.
History stores metadata, a local extracted-text copy, and (when uploaded) the original; ALFRED gets
neither prompts nor attachment contents.

When the server advertises `fileAttachments`, the composer uploads the original bytes first
(`attachments.createUploadUrl` with `type: "file"`) and sends the document with that pending id.
The server then keeps the original next to the text (`<id>.pdf` beside `<id>.txt`, where the id
ends in `-pdf`), serves it as a download, and puts its absolute path in the turn text so agents can
open the real file. Providers still receive the document as inlined text only; no adapter sends a
document natively. A document restored from a saved draft after a reload only has its text left
and sends as text.

Limits: twelve combined attachments, 20MB/document, 250 PDF pages, and 500,000 extracted
characters/document. Scanned PDFs need OCR, which is not in v1. A document whose text cannot be read
(too large, scanned, too many pages) attaches as a generic file instead when the server takes files.
