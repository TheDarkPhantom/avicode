import {
  PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES,
  type EnvironmentId,
} from "@t3tools/contracts";
import { resolveAssetUrl } from "@t3tools/client-runtime/state/assets";
import {
  deletePendingAttachmentUpload,
  runAttachmentUploadCycle,
} from "@t3tools/client-runtime/state/attachments";
import * as Option from "effect/Option";
import { AsyncResult } from "effect/unstable/reactivity";
import { create } from "zustand";

import type { ComposerImageAttachment } from "../composerDraftStore";
import { environmentCatalog } from "../connection/catalog";
import { appAtomRegistry } from "../rpc/atomRegistry";
import { attachmentEnvironment } from "../state/attachments";
import { readPreparedConnection } from "../state/session";
import type { AttachmentUploadState, ReadyAttachmentUpload } from "./attachmentUploadState";

/**
 * Upload-first composer attachments. When the server advertises
 * `capabilities.attachmentUploads`, the composer streams each attachment's
 * bytes to a pending upload as soon as it is attached, and the send only
 * references the pending id. Keyed by the composer attachment id; the state
 * lives in memory only, the draft persists what it needs on its own.
 */
export type UploadableComposerAttachment = ComposerImageAttachment;

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

async function runUpload(job: UploadJob): Promise<void> {
  const mimeType = PROVIDER_SEND_TURN_SUPPORTED_IMAGE_MIME_TYPES.find(
    (supportedMimeType) => supportedMimeType === job.attachment.mimeType.toLowerCase(),
  );
  if (!mimeType) {
    setUploadState(job.attachment.id, failedState(job, "Unsupported image type"));
    return;
  }

  const file = job.attachment.file;
  let lastStep = -1;
  const result = await runAttachmentUploadCycle({
    registry: appAtomRegistry,
    createUploadUrl: attachmentEnvironment.createUploadUrl,
    remove: attachmentEnvironment.remove,
    environmentId: job.environmentId,
    upload: { name: job.attachment.name, mimeType, sizeBytes: file.size },
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

/** Stops the job and deletes only the pending upload it minted itself. */
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
