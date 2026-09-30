import { EnvironmentId } from "@t3tools/contracts";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

import type {
  ComposerDocumentAttachment,
  ComposerFileAttachment,
  ComposerImageAttachment,
} from "../composerDraftStore";

const uploads = vi.hoisted(() => ({
  ready: new Map<string, string>(),
  started: [] as string[],
}));

vi.mock("./attachmentUploadQueue", () => ({
  awaitAttachmentUploads: async () => {},
  forgetAttachmentUploads: () => {},
  readAttachmentUpload: (id: string) =>
    uploads.ready.has(id) ? undefined : { status: "failed", reason: "Upload rejected (500)" },
  readUploadedAttachmentId: (_environmentId: string, id: string) => uploads.ready.get(id) ?? null,
  releaseAttachmentUpload: () => {},
  startAttachmentUpload: (input: { attachment: { id: string } }) => {
    uploads.started.push(input.attachment.id);
  },
}));

vi.mock("../components/ChatView.logic", () => ({
  readFileAsDataUrl: async () => "data:image/png;base64,AAAA",
}));

import {
  buildComposerTurnAttachments,
  optimisticComposerAttachments,
  settleComposerAttachmentUploads,
} from "./composerTurnAttachments";

const environmentId = EnvironmentId.make("environment-1");
const bytes = (name: string, type: string) => new File([new Uint8Array([1, 2, 3])], name, { type });

const image: ComposerImageAttachment = {
  type: "image",
  id: "image-1",
  name: "shot.png",
  mimeType: "image/png",
  sizeBytes: 3,
  previewUrl: "blob:image-1",
  file: bytes("shot.png", "image/png"),
};
const document: ComposerDocumentAttachment = {
  type: "document",
  id: "doc-1",
  name: "brief.pdf",
  mimeType: "application/pdf",
  sizeBytes: 3,
  extractedChars: 5,
  extractedText: "hello",
  previewUrl: "",
  file: bytes("brief.pdf", "application/pdf"),
};
// After a reload the draft holds the extracted text, not the original bytes.
const hydratedDocument: ComposerDocumentAttachment = {
  ...document,
  id: "doc-hydrated",
  file: bytes("brief.pdf", "text/plain").slice(0, 1) as File,
};
const file: ComposerFileAttachment = {
  type: "file",
  id: "file-1",
  name: "src.zip",
  mimeType: "application/zip",
  sizeBytes: 3,
  file: bytes("src.zip", "application/zip"),
};

describe("composer turn attachments", () => {
  beforeEach(() => {
    uploads.ready.clear();
    uploads.started = [];
  });

  it("references pending uploads and keeps document text alongside the original", async () => {
    uploads.ready.set("image-1", "pending-image");
    uploads.ready.set("doc-1", "pending-doc-pdf");
    uploads.ready.set("file-1", "pending-file-zip");

    const attachments = [image, document, hydratedDocument, file];
    expect(
      await settleComposerAttachmentUploads({ environmentId, attachments, fileUploadLimit: 1024 }),
    ).toBeNull();
    // The hydrated document has no original left to upload.
    expect(uploads.started).toEqual(["image-1", "doc-1", "file-1"]);

    expect(
      await buildComposerTurnAttachments({
        environmentId,
        attachments,
        useUploads: true,
        fileUploadLimit: 1024,
      }),
    ).toEqual([
      { type: "image", id: "pending-image", name: "shot.png", mimeType: "image/png", sizeBytes: 3 },
      {
        type: "document",
        id: "pending-doc-pdf",
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        extractedText: "hello",
      },
      {
        type: "document",
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        extractedText: "hello",
      },
      {
        type: "file",
        id: "pending-file-zip",
        name: "src.zip",
        mimeType: "application/zip",
        sizeBytes: 3,
      },
    ]);
  });

  it("sends documents as text only when the server takes no files", async () => {
    uploads.ready.set("image-1", "pending-image");
    await settleComposerAttachmentUploads({
      environmentId,
      attachments: [image, document],
      fileUploadLimit: null,
    });
    expect(uploads.started).toEqual(["image-1"]);
    const [, sentDocument] = await buildComposerTurnAttachments({
      environmentId,
      attachments: [image, document],
      useUploads: true,
      fileUploadLimit: null,
    });
    expect(sentDocument).not.toHaveProperty("id");
  });

  it("falls back to inline images and refuses files without uploads", async () => {
    expect(
      await buildComposerTurnAttachments({
        environmentId,
        attachments: [image],
        useUploads: false,
        fileUploadLimit: null,
      }),
    ).toEqual([
      {
        type: "image",
        name: "shot.png",
        mimeType: "image/png",
        sizeBytes: 3,
        dataUrl: "data:image/png;base64,AAAA",
      },
    ]);
    await expect(
      buildComposerTurnAttachments({
        environmentId,
        attachments: [file],
        useUploads: false,
        fileUploadLimit: null,
      }),
    ).rejects.toThrow("needs a connected server");
  });

  it("names the failed upload and asks for a re-pick of interrupted files", async () => {
    expect(
      await settleComposerAttachmentUploads({
        environmentId,
        attachments: [file],
        fileUploadLimit: 1024,
      }),
    ).toBe("'src.zip' did not upload (Upload rejected (500)). Retry or remove it before sending.");
    expect(
      await settleComposerAttachmentUploads({
        environmentId,
        attachments: [{ ...file, file: null }],
        fileUploadLimit: 1024,
      }),
    ).toBe("Attach 'src.zip' again or remove it before sending.");
  });

  it("shows files as not yet downloadable in the optimistic message", () => {
    expect(optimisticComposerAttachments([file, document])).toEqual([
      {
        type: "file",
        id: "file-1",
        name: "src.zip",
        mimeType: "application/zip",
        sizeBytes: 3,
        downloadable: false,
      },
      {
        type: "document",
        id: "doc-1",
        name: "brief.pdf",
        mimeType: "application/pdf",
        sizeBytes: 3,
        extractedChars: 5,
      },
    ]);
  });
});
