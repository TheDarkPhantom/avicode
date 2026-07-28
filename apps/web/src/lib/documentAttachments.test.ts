import { describe, expect, it } from "vite-plus/test";
import { resolveDocumentMimeType, validateDocumentFile } from "./documentAttachments";

describe("documentAttachments", () => {
  it("recognizes PDF, TXT, and Markdown by extension when browsers omit MIME", () => {
    expect(resolveDocumentMimeType(new File(["x"], "brief.pdf"))).toBe("application/pdf");
    expect(resolveDocumentMimeType(new File(["x"], "notes.txt"))).toBe("text/plain");
    expect(resolveDocumentMimeType(new File(["x"], "README.md"))).toBe("text/markdown");
  });

  it("rejects unsupported and empty documents", () => {
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("Unsupported");
    expect(validateDocumentFile(new File([], "empty.txt"))).toContain("empty");
  });
});
