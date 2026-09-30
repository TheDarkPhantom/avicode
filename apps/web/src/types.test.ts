import { describe, expect, it } from "vite-plus/test";

import {
  type ChatAttachment,
  isDocumentAttachment,
  isFileAttachment,
  isImageAttachment,
  videoMimeType,
} from "./types";

const base = { name: "a", mimeType: "application/octet-stream", sizeBytes: 1 };
const image: ChatAttachment = { ...base, type: "image", id: "i", mimeType: "image/png" };
const document: ChatAttachment = {
  ...base,
  type: "document",
  id: "d",
  mimeType: "application/pdf",
  extractedChars: 3,
};
const file: ChatAttachment = { ...base, type: "file", id: "f" };
const unknown: ChatAttachment = { ...base, type: "somethingnew", id: "u" };

describe("attachment type guards", () => {
  it("split the union by type, leaving unknown types unmatched", () => {
    const attachments = [image, document, file, unknown];
    expect(attachments.filter(isImageAttachment)).toEqual([image]);
    expect(attachments.filter(isDocumentAttachment)).toEqual([document]);
    expect(attachments.filter(isFileAttachment)).toEqual([file]);
    expect(
      attachments.filter(
        (attachment) =>
          !isImageAttachment(attachment) &&
          !isDocumentAttachment(attachment) &&
          !isFileAttachment(attachment),
      ),
    ).toEqual([unknown]);
  });
});

describe("videoMimeType", () => {
  it("reads the mime, or the extension when the browser gave a generic type", () => {
    expect(videoMimeType({ name: "a.bin", mimeType: 'video/mp4; codecs="avc1"' })).toBe(
      "video/mp4",
    );
    for (const [name, expected] of [
      ["clip.mov", "video/quicktime"],
      ["clip.webm", "video/webm"],
      ["clip.MKV", "video/x-matroska"],
    ] as const) {
      expect(videoMimeType({ name, mimeType: "application/octet-stream" })).toBe(expected);
    }
    expect(videoMimeType({ name: "src.zip", mimeType: "application/zip" })).toBeNull();
  });
});
