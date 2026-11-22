import { describe, expect, it } from "vite-plus/test";

import { formatAttachmentUploadProgress } from "./attachmentUploadState";

describe("formatAttachmentUploadProgress", () => {
  it("formats bounded whole percentages", () => {
    expect(formatAttachmentUploadProgress(0.429)).toBe("42%");
    expect(formatAttachmentUploadProgress(2)).toBe("100%");
    expect(formatAttachmentUploadProgress(Number.NaN)).toBe("0%");
  });
});
