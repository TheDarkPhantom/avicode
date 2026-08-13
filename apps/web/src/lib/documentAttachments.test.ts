import { describe, expect, it } from "vite-plus/test";
import {
  extractDocument,
  resolveDocumentMimeType,
  validateDocumentFile,
} from "./documentAttachments";

describe("documentAttachments", () => {
  it("recognizes PDF, TXT, Markdown, and CSV by extension when browsers omit MIME", () => {
    expect(resolveDocumentMimeType(new File(["x"], "brief.pdf"))).toBe("application/pdf");
    expect(resolveDocumentMimeType(new File(["x"], "notes.txt"))).toBe("text/plain");
    expect(resolveDocumentMimeType(new File(["x"], "README.md"))).toBe("text/markdown");
    expect(resolveDocumentMimeType(new File(["x"], "data.csv"))).toBe("text/csv");
  });

  it("recognizes the CSV MIME type", () => {
    expect(resolveDocumentMimeType(new File(["x"], "data", { type: "text/csv" }))).toBe("text/csv");
  });

  it("extracts CSV as raw text", async () => {
    const text = 'name,note\nAda,"keeps, comma"\nLinus,plain';
    const extracted = await extractDocument(new File([text], "people.csv", { type: "text/csv" }));

    expect(extracted).toMatchObject({
      mimeType: "text/csv",
      text,
      pageCount: null,
      truncated: false,
    });
  });

  it("rejects unsupported and empty documents", () => {
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("Unsupported");
    expect(validateDocumentFile(new File([], "empty.csv"))).toContain("empty");
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("CSV");
  });
});
