import {
  PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES,
  type EnvironmentId,
} from "@t3tools/contracts";
import { parseScopedThreadKey } from "@t3tools/client-runtime/environment";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import {
  deletePendingAttachmentUpload,
  runAttachmentUploadCycle,
  verifyPersistedAttachmentUpload,
} from "@t3tools/client-runtime/state/attachments";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { create } from "zustand";

import {
  DraftId,
  useComposerDraftStore,
  type ComposerDocumentAttachment,
  type ComposerFileAttachment,
  type ComposerImageAttachment,
  type ComposerThreadTarget,
} from "../composerDraftStore";
import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { assetEnvironment } from "../state/assets";
import { attachmentEnvironment } from "../state/attachments";
import { readPreparedConnection } from "../state/session";
import type { AttachmentUploadState, ReadyAttachmentUpload } from "./attachmentUploadState";

/**
 * Upload-first composer attachments. When the server advertises
 * `capabilities.attachmentUploads`, the composer streams each attachment's
 * bytes to a pending upload as soon as it is attached, and the send only
 * references the pending id. Keyed by the composer attachment id; the state
 * lives in memory only. Generic files also record the finished id on their
 * draft (`uploadedAttachmentId`) because their bytes cannot persist.
 *
 * Avi Code addition: documents upload their original bytes as a `file` next
 * to the extracted text the fork already sends.
 */
export type UploadableComposerAttachment =
  | ComposerImageAttachment
  | ComposerDocumentAttachment
  | ComposerFileAttachment;

const MAX_UPLOADS_PER_ENVIRONMENT = 3;
const UPLOAD_TIMEOUT_MS = 5 * 60_000;

interface AttachmentUploadStore {
  readonly uploadsByAttachmentId: Readonly<Record<string, AttachmentUploadState>>;
}

export const useAttachmentUploadStore = create<AttachmentUploadStore>(() => ({
  uploadsByAttachmentId: {},
}));

interface UploadJob {
  readonly attachment: UploadableComposerAttachment;
  readonly environmentId: EnvironmentId;
  readonly previous?: ReadyAttachmentUpload;
  /**
   * The draft's persisted server-side upload, to verify instead of re-upload.
   * The draft owns this id; the queue never deletes it on cancel or retry.
   * Deleting it goes through `releasePersistedAttachmentUpload` only.
   */
  readonly persistedAttachmentId?: string;
  readonly settled: Promise<void>;
  resolveSettled: () => void;
  /** Only ids this queue minted itself. Cancel and retry may delete these. */
  attachmentId: string | null;
  cancelled: boolean;
  abort: (() => void) | null;
  stopWatchingConnection: () => void;
}

// Failed jobs retain their source and connection subscription until retry or release.
const jobsById = new Map<string, UploadJob>();
const queue: UploadJob[] = [];
const activeUploadsByEnvironment = new Map<EnvironmentId, number>();

function setUploadState(id: string, upload: AttachmentUploadState): void {
  useAttachmentUploadStore.setState((state) => ({
    uploadsByAttachmentId: { ...state.uploadsByAttachmentId, [id]: upload },
  }));
}

function clearUploadState(id: string): void {
  useAttachmentUploadStore.setState((state) => {
    if (!(id in state.uploadsByAttachmentId)) {
      return state;
    }
    const uploadsByAttachmentId = { ...state.uploadsByAttachmentId };
    delete uploadsByAttachmentId[id];
    return { uploadsByAttachmentId };
  });
}

export function readAttachmentUpload(id: string): AttachmentUploadState | undefined {
  return useAttachmentUploadStore.getState().uploadsByAttachmentId[id];
}

/** Finds the drafts holding this file in the job's environment, after any move. */
function currentFileDraftTargets(job: UploadJob): ComposerThreadTarget[] {
  if (job.attachment.type !== "file") {
    return [];
  }
  const store = useComposerDraftStore.getState();
  const targets: ComposerThreadTarget[] = [];
  for (const [key, draft] of Object.entries(store.draftsByThreadKey)) {
    if (!draft.files.some((file) => file.id === job.attachment.id)) {
      continue;
    }
    const draftSession = store.draftThreadsByThreadKey[key];
    if (draftSession !== undefined) {
      if (draftSession.environmentId === job.environmentId) {
        targets.push(DraftId.make(key));
      }
      continue;
    }
    const threadRef = parseScopedThreadKey(key);
    if (threadRef?.environmentId === job.environmentId) {
      targets.push(threadRef);
    }
  }
  return targets;
}

/**
 * Persists a finished file upload onto the draft that owns the file. The
 * mounted composer performs the same write for live updates, but a
 * background completion (user navigated away, upload finished, reload) must
 * not depend on a mounted composer to survive.
 */
function stampDraftFileUpload(job: UploadJob, attachmentId: string): void {
  const store = useComposerDraftStore.getState();
  for (const target of currentFileDraftTargets(job)) {
    store.setFileUpload(target, job.attachment.id, job.environmentId, attachmentId);
  }
}

function deletePendingUpload(environmentId: EnvironmentId, attachmentId: string): void {
  deletePendingAttachmentUpload({
    registry: appAtomRegistry,
    remove: attachmentEnvironment.remove,
    environmentId,
    attachmentId,
  });
}

function uploadBytes(input: {
  readonly url: string;
  readonly file: File;
  readonly mimeType: string;
  readonly onProgress: (progress: number) => void;
}): { readonly done: Promise<void>; readonly abort: () => void } {
  const xhr = new XMLHttpRequest();
  const done = new Promise<void>((resolve, reject) => {
    xhr.open("POST", input.url, true);
    xhr.timeout = UPLOAD_TIMEOUT_MS;
    xhr.setRequestHeader("Content-Type", input.mimeType);
    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && event.total > 0) {
        input.onProgress(event.loaded / event.total);
      }
    });
    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload rejected (${xhr.status})`));
      }
    });
    xhr.addEventListener("error", () => reject(new Error("Upload failed")));
    xhr.addEventListener("timeout", () => reject(new Error("Upload timed out")));
    xhr.addEventListener("abort", () => reject(new Error("Upload cancelled")));
    xhr.send(input.file);
  });

  return { done, abort: () => xhr.abort() };
}

function failedState(job: UploadJob, reason: string, attachmentId?: string | null) {
  return {
    status: "failed" as const,
    environmentId: job.environmentId,
    reason,
    ...(attachmentId ? { attachmentId } : {}),
    ...(job.previous ? { previous: job.previous } : {}),
  };
}

/** A hydrated file's persisted upload: reuse it, or explain why it is gone. */
async function verifyPersistedUpload(
  job: UploadJob,
  persistedAttachmentId: string,
): Promise<"done" | "reupload"> {
  const verification = await verifyPersistedAttachmentUpload({
    registry: appAtomRegistry,
    createAssetUrl: assetEnvironment.createUrl,
    environmentId: job.environmentId,
    attachmentId: persistedAttachmentId,
  });
  if (job.cancelled) {
    return "done";
  }
  if (verification.status === "verified") {
    setUploadState(job.attachment.id, {
      status: "ready",
      environmentId: job.environmentId,
      attachmentId: persistedAttachmentId,
    });
    return "done";
  }
  if (verification.status === "missing" && !job.attachment.file) {
    // No bytes to upload again: the draft row becomes "attach again".
    const store = useComposerDraftStore.getState();
    let marked = false;
    for (const target of currentFileDraftTargets(job)) {
      marked =
        store.markFileUploadMissing(
          target,
          job.attachment.id,
          job.environmentId,
          persistedAttachmentId,
        ) || marked;
    }
    if (marked) {
      clearUploadState(job.attachment.id);
      return "done";
    }
  }
  if (verification.status === "failed" || !job.attachment.file) {
    // No `attachmentId` here: a failed state's id marks a pending upload this
    // queue minted, which retry and release then delete. The persisted id is
    // the only server copy of a hydrated file, so a transient verification
    // failure must leave it in place for the next retry.
    setUploadState(
      job.attachment.id,
      failedState(
        job,
        verification.status === "missing"
          ? "Uploaded file expired. Remove it and attach it again."
          : "Uploaded file could not be verified. Retry when the server reconnects.",
      ),
    );
    return "done";
  }
  return "reupload";
}

/** What `attachments.createUploadUrl` gets for this attachment, or why it cannot upload. */
function uploadMimeType(attachment: UploadableComposerAttachment): string | null {
  if (attachment.type === "image") {
    return (
      PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES.find(
        (supportedMimeType) => supportedMimeType === attachment.mimeType.toLowerCase(),
      ) ?? null
    );
  }
  return attachment.mimeType.toLowerCase() || "application/octet-stream";
}

async function runUpload(job: UploadJob): Promise<void> {
  if (job.persistedAttachmentId) {
    if ((await verifyPersistedUpload(job, job.persistedAttachmentId)) === "done") {
      return;
    }
  }

  const mimeType = uploadMimeType(job.attachment);
  if (!mimeType) {
    setUploadState(job.attachment.id, failedState(job, "Unsupported image type"));
    return;
  }
  const file = job.attachment.file;
  if (!file) {
    setUploadState(job.attachment.id, failedState(job, "Original file is no longer available"));
    return;
  }

  let lastStep = -1;
  const result = await runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId: job.environmentId,
    upload: {
      // Documents and generic files both upload as `file`; only images use
      // the image route with its type and size checks.
      ...(job.attachment.type === "image" ? {} : { type: "file" as const }),
      name: job.attachment.name,
      mimeType,
      sizeBytes: file.size,
    },
    resolveUploadUrl: (relativeUrl) => {
      const connection = readPreparedConnection(job.environmentId);
      return connection ? resolveAssetUrl(connection.httpBaseUrl, relativeUrl) : null;
    },
    transport: (url) =>
      uploadBytes({
        url,
        file,
        mimeType,
        onProgress: (progress) => {
          // Twenty steps is enough for a percentage label and keeps a large
          // upload from re-rendering the composer on every progress event.
          const step = Math.floor(progress * 20);
          if (step === lastStep || job.cancelled) {
            return;
          }
          lastStep = step;
          setUploadState(job.attachment.id, {
            status: "uploading",
            environmentId: job.environmentId,
            progress,
            ...(job.previous ? { previous: job.previous } : {}),
          });
        },
      }),
    onMinted: (attachmentId) => {
      if (job.cancelled) {
        return "cancel";
      }
      job.attachmentId = attachmentId;
      return "continue";
    },
    onTransferStart: (abort) => {
      job.abort = abort;
    },
  });
  job.abort = null;
  if (result.status === "cancelled" || job.cancelled) {
    return;
  }
  if (result.status === "uploaded") {
    setUploadState(job.attachment.id, {
      status: "ready",
      environmentId: job.environmentId,
      attachmentId: result.attachmentId,
    });
    stampDraftFileUpload(job, result.attachmentId);
    if (job.previous) {
      deletePendingUpload(job.previous.environmentId, job.previous.attachmentId);
    }
    return;
  }
  setUploadState(
    job.attachment.id,
    failedState(
      job,
      result.step === "mint"
        ? "Upload could not start"
        : result.step === "resolve-url"
          ? "Not connected"
          : result.error instanceof Error
            ? result.error.message
            : "Upload failed",
      result.attachmentId,
    ),
  );
}

function pumpUploads(): void {
  for (let index = 0; index < queue.length; ) {
    const job = queue[index]!;
    const active = activeUploadsByEnvironment.get(job.environmentId) ?? 0;
    if (active >= MAX_UPLOADS_PER_ENVIRONMENT) {
      index += 1;
      continue;
    }

    queue.splice(index, 1);
    if (job.cancelled) {
      continue;
    }
    activeUploadsByEnvironment.set(job.environmentId, active + 1);
    void runUpload(job)
      .catch(() => {
        if (!job.cancelled) {
          setUploadState(job.attachment.id, failedState(job, "Upload failed"));
        }
      })
      .finally(() => {
        if (
          jobsById.get(job.attachment.id) === job &&
          readAttachmentUpload(job.attachment.id)?.status !== "failed"
        ) {
          job.stopWatchingConnection();
          jobsById.delete(job.attachment.id);
        }
        const remaining = (activeUploadsByEnvironment.get(job.environmentId) ?? 1) - 1;
        if (remaining > 0) {
          activeUploadsByEnvironment.set(job.environmentId, remaining);
        } else {
          activeUploadsByEnvironment.delete(job.environmentId);
        }
        job.resolveSettled();
        pumpUploads();
      });
  }
}

/**
 * Retries a failed upload once its environment reconnects. The HTTP failure
 * can arrive after the socket has already reconnected, so it waits for that
 * attempt, then retries only if this job still owns the attachment.
 */
function watchConnectionForRetry(
  job: UploadJob,
  input: Parameters<typeof startAttachmentUpload>[0],
): () => void {
  const connectionAtom = environmentCatalog.stateAtom(job.environmentId);
  const isConnected = () =>
    Option.exists(
      AsyncResult.value(appAtomRegistry.get(connectionAtom)),
      (state) => state.phase === "connected",
    );
  let wasConnected = isConnected();
  return appAtomRegistry.subscribe(connectionAtom, () => {
    const connected = isConnected();
    const reconnected = connected && !wasConnected;
    wasConnected = connected;
    if (!reconnected) return;
    void job.settled.then(() => {
      if (
        jobsById.get(job.attachment.id) === job &&
        readAttachmentUpload(job.attachment.id)?.status === "failed" &&
        isConnected()
      ) {
        retryAttachmentUpload(input);
      }
    });
  });
}

export function startAttachmentUpload(input: {
  readonly environmentId: EnvironmentId;
  readonly attachment: UploadableComposerAttachment;
}): void {
  const { attachment, environmentId } = input;
  const existingJob = jobsById.get(attachment.id);
  if (existingJob?.environmentId === environmentId) {
    return;
  }

  const existing = readAttachmentUpload(attachment.id);
  if (existing?.status === "ready" && existing.environmentId === environmentId) {
    return;
  }
  if (existing?.status === "failed" && existing.environmentId === environmentId) {
    return;
  }
  if (existing && "previous" in existing && existing.previous?.environmentId === environmentId) {
    // Switched back to the environment that already holds a finished upload.
    cancelAttachmentUpload(attachment.id);
    if (existing.status === "failed" && existing.attachmentId) {
      deletePendingUpload(existing.environmentId, existing.attachmentId);
    }
    setUploadState(attachment.id, existing.previous);
    return;
  }

  if (existingJob) {
    cancelAttachmentUpload(attachment.id);
  }
  const previous = existing?.status === "ready" ? existing : existing?.previous;
  let resolveSettled: () => void = () => {};
  const settled = new Promise<void>((resolve) => {
    resolveSettled = resolve;
  });
  const job: UploadJob = {
    attachment,
    environmentId,
    ...(previous ? { previous } : {}),
    ...(attachment.type === "file" &&
    attachment.uploadEnvironmentId === environmentId &&
    attachment.uploadedAttachmentId
      ? { persistedAttachmentId: attachment.uploadedAttachmentId }
      : {}),
    settled,
    resolveSettled,
    attachmentId: null,
    cancelled: false,
    abort: null,
    stopWatchingConnection: () => {},
  };

  jobsById.set(attachment.id, job);
  job.stopWatchingConnection = watchConnectionForRetry(job, input);
  queue.push(job);
  setUploadState(attachment.id, {
    status: "uploading",
    environmentId,
    progress: 0,
    ...(previous ? { previous } : {}),
  });
  pumpUploads();
}

/**
 * Stops the job and deletes only the pending upload it minted itself. A
 * persisted draft upload survives cancellation (an environment switch cancels
 * the old job, and the draft still references that server copy).
 */
function cancelAttachmentUpload(id: string): void {
  const job = jobsById.get(id);
  if (!job) {
    return;
  }
  job.cancelled = true;
  job.stopWatchingConnection();
  jobsById.delete(id);
  const queuedIndex = queue.indexOf(job);
  if (queuedIndex !== -1) {
    queue.splice(queuedIndex, 1);
  }
  job.abort?.();
  if (job.attachmentId) {
    deletePendingUpload(job.environmentId, job.attachmentId);
  }
  job.resolveSettled();
}

/** The attachment left the composer: stop it and delete every server copy. */
export function releaseAttachmentUpload(id: string): void {
  const upload = readAttachmentUpload(id);
  cancelAttachmentUpload(id);
  if (upload?.status === "ready") {
    deletePendingUpload(upload.environmentId, upload.attachmentId);
  } else if (upload) {
    if (upload.status === "failed" && upload.attachmentId) {
      deletePendingUpload(upload.environmentId, upload.attachmentId);
    }
    if (upload.previous) {
      deletePendingUpload(upload.previous.environmentId, upload.previous.attachmentId);
    }
  }
  clearUploadState(id);
}

export function releaseAttachmentUploads(ids: ReadonlyArray<string>): void {
  for (const id of ids) {
    releaseAttachmentUpload(id);
  }
}

/** Deletes a draft file's persisted upload, and anything the queue holds for it. */
export function releasePersistedAttachmentUpload(input: {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly attachmentId: string;
}): void {
  // The queue only deletes ids it minted, so the persisted id needs its own
  // delete. The server treats a repeated delete as a no-op.
  releaseAttachmentUpload(input.id);
  deletePendingUpload(input.environmentId, input.attachmentId);
}

/**
 * The one owner for discarding a draft attachment's server-side upload. The
 * queue-keyed release only sees in-memory state, so after a reload it finds
 * nothing for a hydrated file and the pending upload would leak until the
 * server sweep. Every draft discard path funnels through here.
 */
export function releaseDraftAttachment(
  attachment: UploadableComposerAttachment | { id: string },
): void {
  if (
    "type" in attachment &&
    attachment.type === "file" &&
    attachment.uploadedAttachmentId !== undefined &&
    attachment.uploadEnvironmentId !== undefined
  ) {
    releasePersistedAttachmentUpload({
      id: attachment.id,
      environmentId: attachment.uploadEnvironmentId,
      attachmentId: attachment.uploadedAttachmentId,
    });
    return;
  }
  releaseAttachmentUpload(attachment.id);
}

export function releaseDraftAttachments(
  attachments: ReadonlyArray<UploadableComposerAttachment | { id: string }>,
): void {
  for (const attachment of attachments) {
    releaseDraftAttachment(attachment);
  }
}

/**
 * Drops the local record of finished uploads without deleting them. A stored
 * turn (offline outbox or held behind a running turn) now references the
 * pending ids and claims them when it dispatches; the server sweeps anything
 * never claimed.
 */
export function forgetAttachmentUploads(ids: ReadonlyArray<string>): void {
  for (const id of ids) {
    const job = jobsById.get(id);
    if (job) {
      job.stopWatchingConnection();
      jobsById.delete(id);
    }
    clearUploadState(id);
  }
}

export function retryAttachmentUpload(input: {
  readonly environmentId: EnvironmentId;
  readonly attachment: UploadableComposerAttachment;
}): void {
  const previous = readAttachmentUpload(input.attachment.id);
  cancelAttachmentUpload(input.attachment.id);
  // A failed state's `attachmentId` is always one this queue minted.
  if (previous?.status === "failed" && previous.attachmentId) {
    deletePendingUpload(previous.environmentId, previous.attachmentId);
  }
  if (previous && "previous" in previous && previous.previous) {
    setUploadState(input.attachment.id, previous.previous);
  } else {
    clearUploadState(input.attachment.id);
  }
  startAttachmentUpload(input);
}

export async function awaitAttachmentUploads(ids: ReadonlyArray<string>): Promise<void> {
  await Promise.all(ids.map((id) => jobsById.get(id)?.settled));
}

/** The pending upload id for an attachment, when it finished in this environment. */
export function readUploadedAttachmentId(environmentId: EnvironmentId, id: string): string | null {
  const upload = readAttachmentUpload(id);
  return upload?.status === "ready" && upload.environmentId === environmentId
    ? upload.attachmentId
    : null;
}
