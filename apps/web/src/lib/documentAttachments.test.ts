import { describe, expect, it, vi } from "vite-plus/test";
import {
  extractDocument,
  resolveDocumentMimeType,
  validateDocumentFile,
} from "./documentAttachments";

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

describe("documentAttachments", () => {
  it("recognizes PDF, TXT, Markdown, CSV, JSON, and DOCX by extension when browsers omit MIME", () => {
    expect(resolveDocumentMimeType(new File(["x"], "brief.pdf"))).toBe("application/pdf");
    expect(resolveDocumentMimeType(new File(["x"], "notes.txt"))).toBe("text/plain");
    expect(resolveDocumentMimeType(new File(["x"], "README.md"))).toBe("text/markdown");
    expect(resolveDocumentMimeType(new File(["x"], "data.csv"))).toBe("text/csv");
    expect(resolveDocumentMimeType(new File(["x"], "config.json"))).toBe("application/json");
    expect(resolveDocumentMimeType(new File(["x"], "report.docx"))).toBe(DOCX_MIME_TYPE);
  });

  it("recognizes the CSV, JSON, and DOCX MIME types", () => {
    expect(resolveDocumentMimeType(new File(["x"], "data", { type: "text/csv" }))).toBe("text/csv");
    expect(resolveDocumentMimeType(new File(["x"], "data", { type: "application/json" }))).toBe(
      "application/json",
    );
    expect(resolveDocumentMimeType(new File(["x"], "data", { type: DOCX_MIME_TYPE }))).toBe(
      DOCX_MIME_TYPE,
    );
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

  it("extracts JSON as raw text", async () => {
    const text = '{"name":"Ada","roles":["author","mathematician"]}';
    const extracted = await extractDocument(
      new File([text], "person.json", { type: "application/json" }),
    );

    expect(extracted).toMatchObject({
      mimeType: "application/json",
      text,
      pageCount: null,
      truncated: false,
    });
  });

  it("extracts DOCX text through mammoth", async () => {
    const extractRawText = vi.fn().mockResolvedValue({ value: "Quarterly report body." });
    vi.doMock("mammoth", () => ({ extractRawText }));

    const extracted = await extractDocument(
      new File(["binary-docx-bytes"], "report.docx", { type: DOCX_MIME_TYPE }),
    );

    expect(extractRawText).toHaveBeenCalledOnce();
    expect(extracted).toMatchObject({
      mimeType: DOCX_MIME_TYPE,
      text: "Quarterly report body.",
      pageCount: null,
      truncated: false,
    });

    vi.doUnmock("mammoth");
  });

  it("tells the user to enable OCR when a PDF has no selectable text and OCR is off", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getDocument = vi.fn().mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve({ getTextContent: () => Promise.resolve({ items: [] }) }),
        destroy,
      }),
    });
    vi.doMock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
      GlobalWorkerOptions: {},
      getDocument,
    }));

    await expect(
      extractDocument(new File(["%PDF-scan"], "scan.pdf", { type: "application/pdf" }), {
        ocrScannedPdfs: false,
      }),
    ).rejects.toThrow(/Turn on OCR/);
    expect(destroy).toHaveBeenCalledOnce();

    vi.doUnmock("pdfjs-dist/legacy/build/pdf.mjs");
  });

  it("rejects unsupported and empty documents", () => {
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("Unsupported");
    expect(validateDocumentFile(new File([], "empty.csv"))).toContain("empty");
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("CSV");
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("JSON");
    expect(validateDocumentFile(new File(["x"], "archive.zip"))).toContain("DOCX");
  });
});
