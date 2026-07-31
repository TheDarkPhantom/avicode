/**
 * Avi Code addition: the delimited block an attached document's extracted text
 * is wrapped in before it goes to a provider.
 *
 * The format lives here rather than next to the server code that writes it,
 * because the renderer has to strip these blocks back out of the prompt it
 * shows. Two copies of the tag name would drift the first time one side
 * changed, and the failure would be silent: the block simply stops being
 * hidden and the whole document appears in the chat.
 */
export const DOCUMENT_CONTEXT_TAG = "avicode_document";

function escapeDocumentAttribute(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

export function formatDocumentContext(input: {
  readonly name: string;
  readonly mimeType: string;
  readonly text: string;
}): string {
  return `<${DOCUMENT_CONTEXT_TAG} name="${escapeDocumentAttribute(input.name)}" mime="${escapeDocumentAttribute(input.mimeType)}">\n${input.text}\n</${DOCUMENT_CONTEXT_TAG}>`;
}

/**
 * Matches the run of document blocks the server appends to the end of a
 * prompt. Anchoring at the end is what makes this safe on a document whose own
 * text contains the closing tag: the lazy body has to keep growing until the
 * whole run still reaches the end of the string.
 */
const OPENING_TAG_SOURCE = `<${DOCUMENT_CONTEXT_TAG}\\s[\\s\\S]*?>\\n`;
const BLOCK_SOURCE = `${OPENING_TAG_SOURCE}[\\s\\S]*?\\n</${DOCUMENT_CONTEXT_TAG}>`;
const TRAILING_DOCUMENT_CONTEXT_BLOCK_PATTERN = new RegExp(
  `\\n*${BLOCK_SOURCE}(?:\\s*${BLOCK_SOURCE})*\\s*$`,
);

export interface ExtractedDocumentContexts {
  /** The prompt with the document blocks removed. */
  readonly promptText: string;
  readonly documentCount: number;
}

export function extractTrailingDocumentContexts(prompt: string): ExtractedDocumentContexts {
  const match = TRAILING_DOCUMENT_CONTEXT_BLOCK_PATTERN.exec(prompt);
  if (!match) {
    return { promptText: prompt, documentCount: 0 };
  }
  const documentCount = (match[0].match(new RegExp(`<${DOCUMENT_CONTEXT_TAG}\\s`, "g")) ?? [])
    .length;
  return {
    promptText: prompt.slice(0, match.index).replace(/\n+$/, ""),
    documentCount,
  };
}
