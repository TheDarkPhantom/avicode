# Document attachments

AviCode accepts images plus PDF, TXT, `.md`, and `.markdown` by paste or drag-and-drop.

Extraction is local. TXT/Markdown use UTF-8; PDF uses PDF.js. Sanitized text reaches every provider
as a delimited context. The original is not uploaded to an AviCode service. History stores
metadata and a local extracted-text copy; ALFRED gets neither prompts nor attachment contents.

Limits: eight combined attachments, 20MB/document, 250 PDF pages, and 500,000 extracted
characters/document. Scanned PDFs need OCR, which is not in v1.
