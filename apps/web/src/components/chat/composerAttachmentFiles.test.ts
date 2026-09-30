import { PROVIDER_SEND_TURN_MAX_FILE_BYTES } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  classifyComposerAttachmentFile,
  fileAttachmentCapabilityBlockReason,
  fileAttachmentStagingLimit,
  normalizeComposerImageFileMimeType,
  shouldHandleComposerAttachmentPaste,
} from "./composerAttachmentFiles";

const file = (name: string, type: string) => new File([new Uint8Array([1])], name, { type });

describe("classifyComposerAttachmentFile", () => {
  it("routes pictures, documents, and everything else", () => {
    expect(classifyComposerAttachmentFile(file("a.png", "image/png"))).toBe("image");
    expect(classifyComposerAttachmentFile(file("a.svg", "image/svg+xml"))).toBe(
      "unsupported-image",
    );
    expect(classifyComposerAttachmentFile(file("a.pdf", "application/pdf"))).toBe("document");
    expect(classifyComposerAttachmentFile(file("notes.md", ""))).toBe("document");
    expect(classifyComposerAttachmentFile(file("src.zip", "application/zip"))).toBe("file");
  });

  it("recognizes images with an empty or generic type by extension", () => {
    expect(classifyComposerAttachmentFile(file("photo.JPG", ""))).toBe("image");
    expect(classifyComposerAttachmentFile(file("photo.webp", "application/octet-stream"))).toBe(
      "image",
    );
    expect(normalizeComposerImageFileMimeType(file("photo.jpg", "")).type).toBe("image/jpeg");
  });
});

describe("file attachment capability", () => {
  const known = { attachmentUploadsCapabilityKnown: true, supportsAttachmentUploads: true };

  it("stages at the contract cap until the server config arrives", () => {
    expect(
      fileAttachmentStagingLimit({
        attachmentUploadsCapabilityKnown: false,
        supportsAttachmentUploads: false,
        maxFileAttachmentBytes: null,
      }),
    ).toBe(PROVIDER_SEND_TURN_MAX_FILE_BYTES);
  });

  it("refuses files on servers that do not take them", () => {
    const state = { ...known, maxFileAttachmentBytes: null };
    expect(fileAttachmentStagingLimit(state)).toBeNull();
    expect(
      fileAttachmentCapabilityBlockReason({ ...state, files: [{ name: "a.zip", sizeBytes: 1 }] }),
    ).toContain("does not accept file attachments");
  });

  it("blocks a retained file over the advertised limit", () => {
    expect(
      fileAttachmentCapabilityBlockReason({
        ...known,
        maxFileAttachmentBytes: 1024,
        files: [{ name: "big.zip", sizeBytes: 2048 }],
      }),
    ).toBe("'big.zip' exceeds the 1 KB attachment limit.");
    expect(
      fileAttachmentCapabilityBlockReason({ ...known, maxFileAttachmentBytes: 1024, files: [] }),
    ).toBeNull();
  });
});

describe("shouldHandleComposerAttachmentPaste", () => {
  it("claims pasted pictures and documents even alongside text", () => {
    expect(
      shouldHandleComposerAttachmentPaste({
        files: [file("a.png", "image/png")],
        plainText: "caption",
      }),
    ).toBe(true);
    expect(
      shouldHandleComposerAttachmentPaste({
        files: [file("a.pdf", "application/pdf")],
        plainText: "",
      }),
    ).toBe(true);
  });

  it("lets text win over a generic file rendering of the same copy", () => {
    const zip = file("a.zip", "application/zip");
    expect(shouldHandleComposerAttachmentPaste({ files: [zip], plainText: "hello" })).toBe(false);
    expect(shouldHandleComposerAttachmentPaste({ files: [zip], plainText: "" })).toBe(true);
  });
});
