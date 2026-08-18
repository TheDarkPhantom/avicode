import {
  PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES,
  PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS,
} from "@t3tools/contracts";

export const SUPPORTED_DOCUMENT_EXTENSIONS = [
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".csv",
  ".json",
  ".docx",
] as const;
export const MAX_PDF_PAGES = 250;

const DOCX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type SupportedDocumentMimeType =
  | "application/pdf"
  | "text/plain"
  | "text/markdown"
  | "text/csv"
  | "application/json"
  | typeof DOCX_MIME_TYPE;

export interface ExtractedDocument {
  readonly mimeType: SupportedDocumentMimeType;
  readonly text: string;
  readonly pageCount: number | null;
  readonly truncated: boolean;
}

// Avi Code addition. OCR for scanned PDFs runs locally and is opt-in, so the
// caller passes the resolved `aviCodeOcrScannedPdfs` setting through here.
export interface ExtractDocumentOptions {
  readonly ocrScannedPdfs?: boolean;
}

export function resolveDocumentMimeType(
  file: Pick<File, "name" | "type">,
): SupportedDocumentMimeType | null {
  const name = file.name.toLowerCase();
  if (file.type === "application/pdf" || name.endsWith(".pdf")) return "application/pdf";
  if (file.type === DOCX_MIME_TYPE || name.endsWith(".docx")) return DOCX_MIME_TYPE;
  if (file.type === "text/markdown" || name.endsWith(".md") || name.endsWith(".markdown")) {
    return "text/markdown";
  }
  if (file.type === "text/csv" || name.endsWith(".csv")) return "text/csv";
  if (file.type === "application/json" || name.endsWith(".json")) return "application/json";
  if (file.type === "text/plain" || name.endsWith(".txt")) return "text/plain";
  return null;
}

export function validateDocumentFile(file: File): string | null {
  if (!resolveDocumentMimeType(file)) {
    return `Unsupported file type for '${file.name}'. Attach PDF, DOCX, TXT, Markdown, CSV, JSON, or an image.`;
  }
  if (file.size <= 0) return `'${file.name}' is empty.`;
  if (file.size > PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES) {
    return `'${file.name}' exceeds the 20MB document limit.`;
  }
  return null;
}

function capDocumentText(text: string): Pick<ExtractedDocument, "text" | "truncated"> {
  const normalized = text.replaceAll(String.fromCharCode(0), "").trim();
  if (normalized.length <= PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS) {
    return { text: normalized, truncated: false };
  }
  return {
    text: normalized.slice(0, PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS),
    truncated: true,
  };
}

// Avi Code addition. Rasterize each page and read it with tesseract.js. Only
// reached when a PDF yields no selectable text and the user opted into OCR, so
// the slow path never runs for ordinary text PDFs.
async function ocrPdfPages(document: {
  numPages: number;
  getPage: (n: number) => Promise<any>;
}): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = new OffscreenCanvas(viewport.width, viewport.height);
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not create a canvas for OCR.");
      await page.render({ canvasContext: context, viewport }).promise;
      const blob = await canvas.convertToBlob();
      const result = await worker.recognize(blob);
      pages.push(`--- Page ${pageNumber} ---\n${result.data.text}`);
    }
  } finally {
    await worker.terminate();
  }
  return pages.join("\n\n");
}

async function extractPdf(file: File, options: ExtractDocumentOptions): Promise<ExtractedDocument> {
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
    // Track the pages' actual text separately from the "--- Page N ---" framing:
    // a scanned PDF still produces those headers, so the framed string is never
    // empty and cannot itself signal "no selectable text".
    let hasSelectableText = false;
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const text = content.items
        .flatMap((item) => ("str" in item && typeof item.str === "string" ? [item.str] : []))
        .join(" ");
      if (text.trim().length > 0) hasSelectableText = true;
      pages.push(`--- Page ${pageNumber} ---\n${text}`);
    }
    if (hasSelectableText) {
      return { mimeType: "application/pdf", pageCount, ...capDocumentText(pages.join("\n\n")) };
    }
    // No selectable text. OCR it if the user opted in, otherwise explain why.
    if (options.ocrScannedPdfs) {
      const ocrCapped = capDocumentText(await ocrPdfPages(document));
      if (ocrCapped.text.length === 0) {
        throw new Error("OCR found no readable text in this scanned PDF.");
      }
      return { mimeType: "application/pdf", pageCount, ...ocrCapped };
    }
    throw new Error(
      "No selectable text was found. Turn on OCR for scanned PDFs in Avi Code settings.",
    );
  } finally {
    await document.destroy();
  }
}

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  const capped = capDocumentText(result.value);
  if (capped.text.length === 0) throw new Error(`'${file.name}' contains no readable text.`);
  return { mimeType: DOCX_MIME_TYPE, pageCount: null, ...capped };
}

export async function extractDocument(
  file: File,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedDocument> {
  const validationError = validateDocumentFile(file);
  if (validationError) throw new Error(validationError);
  const mimeType = resolveDocumentMimeType(file);
  if (!mimeType) throw new Error(`Unsupported document '${file.name}'.`);
  if (mimeType === "application/pdf") return extractPdf(file, options);
  if (mimeType === DOCX_MIME_TYPE) return extractDocx(file);

  const capped = capDocumentText(await file.text());
  if (capped.text.length === 0) throw new Error(`'${file.name}' contains no readable text.`);
  return { mimeType, pageCount: null, ...capped };
}
