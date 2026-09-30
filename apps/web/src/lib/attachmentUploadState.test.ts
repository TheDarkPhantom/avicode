import { EnvironmentId } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  attachmentUploadBlockReason,
  formatAttachmentUploadProgress,
} from "./attachmentUploadState";

const environmentId = EnvironmentId.make("environment-1");

describe("attachmentUploadBlockReason", () => {
  it("allows uploaded attachments from the active environment", () => {
    expect(
      attachmentUploadBlockReason({
        attachmentIds: ["image-1"],
        environmentId,
        uploadsByAttachmentId: {
          "image-1": {
            status: "ready",
            environmentId,
            attachmentId: "pending-1",
          },
        },
      }),
    ).toBeNull();
  });

  it("blocks attachments that are missing or uploading", () => {
    expect(
      attachmentUploadBlockReason({
        attachmentIds: ["image-1", "image-2"],
        environmentId,
        uploadsByAttachmentId: {
          "image-1": { status: "uploading", environmentId, progress: 0.5 },
        },
      }),
    ).toBe("Attachments still uploading");
  });

  it("asks the user to retry or remove failed uploads", () => {
    expect(
      attachmentUploadBlockReason({
        attachmentIds: ["image-1"],
        environmentId,
        uploadsByAttachmentId: {
          "image-1": { status: "failed", environmentId, reason: "Upload failed" },
        },
      }),
    ).toBe("Retry or remove the failed attachment");
  });

  it("does not accept an upload from another environment", () => {
    expect(
      attachmentUploadBlockReason({
        attachmentIds: ["image-1"],
        environmentId,
        uploadsByAttachmentId: {
          "image-1": {
            status: "ready",
            environmentId: EnvironmentId.make("environment-2"),
            attachmentId: "pending-1",
          },
        },
      }),
    ).toBe("Attachment still uploading");
  });
});

describe("formatAttachmentUploadProgress", () => {
  it("formats bounded whole percentages", () => {
    expect(formatAttachmentUploadProgress(0.429)).toBe("42%");
    expect(formatAttachmentUploadProgress(2)).toBe("100%");
    expect(formatAttachmentUploadProgress(Number.NaN)).toBe("0%");
  });
});
