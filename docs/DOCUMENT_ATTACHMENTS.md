# Document attachments

AviCode accepts images plus PDF, TXT, CSV, `.md`, and `.markdown` by paste or drag-and-drop.

Extraction is local. TXT/Markdown/CSV use UTF-8; PDF uses PDF.js. Sanitized text reaches every provider
as a delimited context. The original is not uploaded to an AviCode service. History stores
metadata and a local extracted-text copy; ALFRED gets neither prompts nor attachment contents.

A client may also upload the original bytes first (`attachments.createUploadUrl` with `type: "file"`)
and send the document with that pending id. The server then keeps the original next to the text
(`<id>.pdf` beside `<id>.txt`, where the id ends in `-pdf`), serves it as a download, and puts its
absolute path in the turn text so agents can open the real file. Providers still receive the
document as inlined text only; no adapter sends a document natively.

Limits: twelve combined attachments, 20MB/document, 250 PDF pages, and 500,000 extracted
characters/document. Scanned PDFs need OCR, which is not in v1.
