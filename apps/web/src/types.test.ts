import { describe, expect, it } from "vite-plus/test";

import {
  type ChatAttachment,
  isDocumentAttachment,
  isFileAttachment,
  isImageAttachment,
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
