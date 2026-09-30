# Attachments

Paste, drop, or pick files with the paperclip in the composer to attach them to a message. A
message holds up to twelve attachments.

- **Images** (PNG, JPEG, GIF, WebP) show as thumbnails. Large images are downscaled to fit.
- **Documents** (PDF, DOCX, TXT, Markdown, CSV, JSON) are read to text on your machine and sent as
  text. On servers that take file uploads the original is uploaded too, so the agent can open the
  real file.
- **Other files** (ZIP, binaries, anything else) up to 50MB attach as files on servers that take
  file uploads. They show as rows with their size and send as a path the agent can open. In the
  chat they download under their original name. A sent PDF or HTML file opens in the file viewer
  instead, with a download button beside it. A sent PDF document opens there too when your server
  kept its original.
- **Videos** attach as files. Select one before or after sending to play it with the built-in
  player. Playback depends on the formats the app can decode (MP4 and WebM play; a Mac `.mov`
  often does not), and anything it cannot play offers a download instead.

## Uploads

On servers that support direct uploads, attachments upload as soon as you add them. Each tile or
row shows its progress, and the send button becomes available once every upload finishes. A failed
upload shows a retry button, and retries on its own when the connection comes back. Removing an
attachment deletes its upload.

A draft keeps its files across a reload. If a file had not finished uploading, its row says
**Attach again**: pick the same file to replace it, or remove it to send.

Offline sends still work for images and documents: the message keeps them inline and sends when the
server reconnects. Files need the server connected.
