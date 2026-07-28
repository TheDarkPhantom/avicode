import {
  PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES,
  PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS,
} from "@t3tools/contracts";

export const SUPPORTED_DOCUMENT_EXTENSIONS = [".pdf", ".txt", ".md", ".markdown"] as const;
export const MAX_PDF_PAGES = 250;

export type SupportedDocumentMimeType = "application/pdf" | "text/plain" | "text/markdown";

export interface ExtractedDocument {
  readonly mimeType: SupportedDocumentMimeType;
  readonly text: string;
  readonly pageCount: number | null;
  readonly truncated: boolean;
}

export function resolveDocumentMimeType(
  file: Pick<File, "name" | "type">,
): SupportedDocumentMimeType | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (file.type === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (file.type === "text/plain" || name.endsWith(".txt")) return "text/plain";
  return null;
}

export function validateDocumentFile(file: File): string | null {
  if (!resolveDocumentMimeType(file)) {
    return `Unsupported file type for '${file.name}'. Attach PDF, TXT, Markdown, or an image.`;
  }
  if (file.size <= 0) return `'${file.name}' is empty.`;
  if (file.size > PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES) {
    return `'${file.name}' exceeds the 20MB document limit.`;
  }
  return null;
}

function capDocumentText(text: string): Pick<ExtractedDocument, "text" | "truncated"> {
  const normalized = text.replaceAll("\u0000", "").trim();
  if (normalized.length <= PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS),
    truncated: true,
  };
}

async function extractPdf(file: File): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
    import.meta.url,
  ).toString();
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
    isEvalSupported: false,
  });
  const document = await task.promise;
  const pageCount = document.numPages;
  if (pageCount > MAX_PDF_PAGES) {
    await document.destroy();
    throw new Error(`PDF has ${pageCount} pages; the limit is ${MAX_PDF_PAGES}.`);
  }

  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => ("str" in item && typeof item.str === "string" ? [item.str] : []))
        .join(" ");
      pages.push(`--- Page ${pageNumber} ---\n${text}`);
    }
  } finally {
    await document.destroy();
  }
  const capped = capDocumentText(pages.join("\n\n"));
  if (capped.text.length === 0) {
    throw new Error("No selectable text was found. Scanned PDFs need OCR, which is not in v1.");
  }
  return { mimeType: "application/pdf", pageCount, ...capped };
}

export async function extractDocument(file: File): Promise<ExtractedDocument> {
  const validationError = validateDocumentFile(file);
  if (validationError) throw new Error(validationError);
  const mimeType = resolveDocumentMimeType(file);
  if (!mimeType) throw new Error(`Unsupported document '${file.name}'.`);
  if (mimeType === "application/pdf") return extractPdf(file);

  const capped = capDocumentText(await file.text());
  if (capped.text.length === 0) throw new Error(`'${file.name}' contains no readable text.`);
  return { mimeType, pageCount: null, ...capped };
}
