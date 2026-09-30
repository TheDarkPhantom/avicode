import type {
  ChatFileAttachment as ContractChatFileAttachment,
  ChatImageAttachment as ContractChatImageAttachment,
  ChatDocumentAttachment as ContractChatDocumentAttachment,
  ChatUnknownAttachment as ContractChatUnknownAttachment,
  OrchestrationCheckpointFile,
  OrchestrationCheckpointSummary,
  OrchestrationLatestTurn,
  OrchestrationMessage,
  OrchestrationProposedPlan,
  OrchestrationSession,
  ProjectScript as ContractProjectScript,
  ProviderInteractionMode,
  RuntimeMode,
} from "@t3tools/contracts";
import type {
  EnvironmentProject,
  EnvironmentThread,
  EnvironmentThreadShell,
} from "@t3tools/client-runtime/state/shell";

export type SessionPhase = "disconnected" | "connecting" | "ready" | "running";
export const DEFAULT_RUNTIME_MODE: RuntimeMode = "full-access";

export const DEFAULT_INTERACTION_MODE: ProviderInteractionMode = "default";
export const DEFAULT_THREAD_TERMINAL_HEIGHT = 280;
export const DEFAULT_THREAD_TERMINAL_ID = "term-1";
export const MAX_TERMINALS_PER_GROUP = 4;
export type ProjectScript = ContractProjectScript;

export interface ThreadTerminalGroup {
  id: string;
  terminalIds: string[];
  splitDirection?: "horizontal" | "vertical";
}

export interface ChatImageAttachment extends ContractChatImageAttachment {
  readonly previewUrl?: string;
}

export type ChatDocumentAttachment = ContractChatDocumentAttachment;
// Generic files render as download rows. `previewUrl` is a resolved asset URL
// when the timeline has one; `downloadable: false` marks an optimistic copy
// whose bytes the server has not claimed yet.
export interface ChatFileAttachment extends ContractChatFileAttachment {
  readonly previewUrl?: string;
  readonly downloadable?: boolean;
}

// Attachment types this build does not know pass through with the contract
// shape. The UI renders them as inert rows so a newer server cannot crash an
// older client.
export type ChatUnknownAttachment = ContractChatUnknownAttachment;

export type ChatAttachment =
  | ChatImageAttachment
  | ChatDocumentAttachment
  | ChatFileAttachment
  | ChatUnknownAttachment;

// The union has an open member (`type: string`), so a literal comparison does
// not narrow. Use these guards wherever type-specific fields are read.
export function isImageAttachment(attachment: ChatAttachment): attachment is ChatImageAttachment {
  return attachment.type === "image";
}

/** Avi Code addition: the fork's extracted-text documents. */
export function isDocumentAttachment(
  attachment: ChatAttachment,
): attachment is ChatDocumentAttachment {
  return attachment.type === "document";
}

export function isFileAttachment(attachment: ChatAttachment): attachment is ChatFileAttachment {
  return attachment.type === "file";
}

const VIDEO_MIME_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  avi: "video/x-msvideo",
  m4v: "video/mp4",
  mkv: "video/x-matroska",
  mov: "video/quicktime",
  mp4: "video/mp4",
  ogv: "video/ogg",
  webm: "video/webm",
};

/**
 * The video type of a file attachment, from its mime or, when the browser
 * handed over a generic type, its extension. Null for anything else.
 */
export function videoMimeType(attachment: {
  readonly name: string;
  readonly mimeType: string;
}): string | null {
  const mimeType = attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (mimeType.startsWith("video/")) return mimeType;
  const dotIndex = attachment.name.lastIndexOf(".");
  return dotIndex < 0
    ? null
    : (VIDEO_MIME_TYPE_BY_EXTENSION[attachment.name.slice(dotIndex + 1).toLowerCase()] ?? null);
}

export function isVideoAttachment(attachment: {
  readonly name: string;
  readonly mimeType: string;
}): boolean {
  return videoMimeType(attachment) !== null;
}

// Persisted ids carry the original's extension when the server kept the
// original bytes of a document: `<thread>-<uuid>-pdf`.
const ATTACHMENT_ID_WITH_EXTENSION =
  /-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-[a-z0-9]{1,10}$/i;

/**
 * Avi Code addition: whether a sent document's original bytes were stored
 * next to its extracted text, so its asset URL serves the original.
 */
export function documentHasStoredOriginal(attachment: { readonly id: string }): boolean {
  return ATTACHMENT_ID_WITH_EXTENSION.test(attachment.id);
}

/** A PDF or HTML file the file viewer can render in place. */
export function isBrowserPreviewAttachment(attachment: {
  readonly name: string;
  readonly mimeType: string;
}): boolean {
  const mimeType = attachment.mimeType.split(";", 1)[0]?.trim().toLowerCase();
  return (
    /\.(?:html?|pdf)$/i.test(attachment.name) ||
    mimeType === "application/pdf" ||
    mimeType === "text/html"
  );
}

export interface ChatMessage extends Omit<OrchestrationMessage, "attachments"> {
  readonly attachments?: ReadonlyArray<ChatAttachment> | undefined;
}

export type ProposedPlan = OrchestrationProposedPlan;
export type TurnDiffFileChange = OrchestrationCheckpointFile;
export type TurnDiffSummary = OrchestrationCheckpointSummary;

export type Project = EnvironmentProject;
export type Thread = EnvironmentThread;
export type ThreadShell = EnvironmentThreadShell;

export interface ThreadTurnState {
  latestTurn: OrchestrationLatestTurn | null;
}

export type SidebarThreadSummary = EnvironmentThreadShell;
export type ThreadSession = OrchestrationSession;
