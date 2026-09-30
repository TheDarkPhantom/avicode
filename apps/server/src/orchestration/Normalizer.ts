import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  type ClientOrchestrationCommand,
  type IsoDateTime,
  type OrchestrationCommand,
  OrchestrationDispatchCommandError,
  PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES,
  PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS,
  PROVIDER_SEND_TURN_MAX_IMAGE_BYTES,
  type ThreadId,
} from "@t3tools/contracts";

import { formatDocumentContext } from "@t3tools/shared/documentContext";

import { resolveAttachmentRelativePath } from "../attachmentPaths.ts";
import {
  attachmentFileExtension,
  attachmentRelativePaths,
  createAttachmentId,
  documentExtractedTextRelativePath,
  parseAttachmentFileExtension,
  planAttachmentClaim,
  PENDING_ATTACHMENT_THREAD_SEGMENT,
  parseThreadSegmentFromAttachmentId,
  resolveAttachmentPath,
} from "../attachmentStore.ts";
import { ServerConfig } from "../config.ts";
import { parseBase64DataUrl } from "../imageMime.ts";
import * as WorkspacePaths from "../workspace/WorkspacePaths.ts";

export const canonicalizeClientCommandTimestamps = (
  command: ClientOrchestrationCommand,
  receivedAt: IsoDateTime,
): ClientOrchestrationCommand => {
  const canonicalCommand =
    "createdAt" in command
      ? {
          ...command,
          createdAt: receivedAt,
        }
      : command;

  if (canonicalCommand.type !== "thread.turn.start" || !canonicalCommand.bootstrap?.createThread) {
    return canonicalCommand;
  }

  return {
    ...canonicalCommand,
    bootstrap: {
      ...canonicalCommand.bootstrap,
      createThread: {
        ...canonicalCommand.bootstrap.createThread,
        createdAt: receivedAt,
      },
    },
  };
};

// Avi Code addition: fork uploads belong to the new aggregate, never the source thread.
export function attachmentOwnerThreadId(command: ClientOrchestrationCommand): ThreadId | null {
  if (command.type === "thread.fork") {
    return command.forkThreadId;
  }
  if (command.type === "thread.turn.start") {
    return command.threadId;
  }
  return null;
}

const removeClaimedAttachmentPaths = Effect.fn("Normalizer.removeClaimedAttachmentPaths")(
  function* (attachmentPaths: ReadonlyArray<string>) {
    if (attachmentPaths.length === 0) {
      return;
    }
    const fileSystem = yield* FileSystem.FileSystem;
    yield* Effect.forEach(
      attachmentPaths,
      (attachmentPath) =>
        fileSystem.remove(attachmentPath, { force: true }).pipe(
          Effect.tapError((cause) =>
            Effect.logWarning("Failed to remove an unclaimed attachment copy.", {
              attachmentPath,
              cause,
            }),
          ),
          Effect.orElseSucceed(() => undefined),
        ),
      { concurrency: 1 },
    );
  },
);

/**
 * Avi Code addition: claims the uploaded original of a document for its
 * thread, the same way a pending file upload is claimed. The upload must be a
 * generic file upload (its id carries an extension) whose size and extension
 * match the document. The pending copy stays until the turn succeeds.
 */
const claimDocumentOriginal = Effect.fn("Normalizer.claimDocumentOriginal")(function* (input: {
  readonly attachmentsDir: string;
  readonly threadId: string;
  readonly attachment: { readonly id: string; readonly name: string; readonly sizeBytes: number };
}) {
  const { attachment } = input;
  const fail = (reason: string) =>
    new OrchestrationDispatchCommandError({
      message: `Document attachment '${attachment.name}' cannot be sent: ${reason}.`,
    });
  if (parseAttachmentFileExtension(attachment.id) === null) {
    return yield* fail("its original must be uploaded as a file");
  }
  const claim = planAttachmentClaim({
    attachmentsDir: input.attachmentsDir,
    threadId: input.threadId,
    attachmentId: attachment.id,
  });
  if (!claim.ok) {
    return yield* fail(claim.reason);
  }

  const fileSystem = yield* FileSystem.FileSystem;
  const info = yield* fileSystem
    .stat(claim.currentPath)
    .pipe(Effect.mapError(() => fail("attachment not found")));
  if (Number(info.size) !== attachment.sizeBytes) {
    return yield* fail("stored size does not match");
  }
  const expectedPath = resolveAttachmentRelativePath({
    attachmentsDir: input.attachmentsDir,
    relativePath: `${claim.finalId}${attachmentFileExtension(attachment.name)}`,
  });
  if (expectedPath !== claim.finalPath) {
    return yield* fail("attachment type does not match the upload");
  }

  yield* fileSystem
    .copyFile(claim.currentPath, claim.finalPath)
    .pipe(Effect.mapError(() => fail("failed to claim the original for this thread")));
  return { finalId: claim.finalId, finalPath: claim.finalPath };
});

export const normalizeDispatchCommand = (command: ClientOrchestrationCommand) =>
  Effect.gen(function* () {
    const receivedAt = DateTime.formatIso(yield* DateTime.now);
    const canonicalCommand = canonicalizeClientCommandTimestamps(command, receivedAt);
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const serverConfig = yield* ServerConfig;
    const workspacePaths = yield* WorkspacePaths.WorkspacePaths;

    const normalizeProjectWorkspaceRoot = (workspaceRoot: string) =>
      workspacePaths.normalizeWorkspaceRoot(workspaceRoot).pipe(
        Effect.mapError(
          (cause) =>
            new OrchestrationDispatchCommandError({
              message: cause.message,
            }),
        ),
      );

    const normalizeProjectWorkspaceRootForCreate = (
      workspaceRoot: string,
      createIfMissing: boolean | undefined,
    ) =>
      workspacePaths
        .normalizeWorkspaceRoot(workspaceRoot, {
          createIfMissing: createIfMissing === true,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new OrchestrationDispatchCommandError({
                message: cause.message,
              }),
          ),
        );

    if (canonicalCommand.type === "project.create") {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRootForCreate(
          canonicalCommand.workspaceRoot,
          canonicalCommand.createWorkspaceRootIfMissing,
        ),
        createWorkspaceRootIfMissing: canonicalCommand.createWorkspaceRootIfMissing === true,
      } satisfies OrchestrationCommand;
    }

    if (
      canonicalCommand.type === "project.meta.update" &&
      canonicalCommand.workspaceRoot !== undefined
    ) {
      return {
        ...canonicalCommand,
        workspaceRoot: yield* normalizeProjectWorkspaceRoot(canonicalCommand.workspaceRoot),
      } satisfies OrchestrationCommand;
    }

    if (canonicalCommand.type !== "thread.turn.start" && canonicalCommand.type !== "thread.fork") {
      return canonicalCommand as OrchestrationCommand;
    }
    const attachmentThreadId =
      canonicalCommand.type === "thread.fork"
        ? canonicalCommand.forkThreadId
        : canonicalCommand.threadId;

    const documentContexts: string[] = [];
    const claimedAttachmentPaths: string[] = [];
    const normalizedAttachments = yield* Effect.forEach(
      canonicalCommand.message.attachments,
      (attachment) =>
        Effect.gen(function* () {
          if (attachment.type === "document") {
            // Avi Code addition: the server only ever learns a document's text
            // from the client, so the persisted shape (without the text) is not
            // something a client may send.
            if (!("extractedText" in attachment)) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Document attachment '${attachment.name}' is missing its extracted text.`,
              });
            }
            const text = attachment.extractedText.trim();
            if (
              attachment.sizeBytes <= 0 ||
              attachment.sizeBytes > PROVIDER_SEND_TURN_MAX_DOCUMENT_BYTES ||
              text.length === 0 ||
              text.length > PROVIDER_SEND_TURN_MAX_DOCUMENT_CHARS
            ) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Document attachment '${attachment.name}' is empty or too large.`,
              });
            }

            // With an upload id, the original bytes are claimed like a file
            // attachment and the persisted id keeps the original's extension.
            const original =
              attachment.id === undefined
                ? null
                : yield* claimDocumentOriginal({
                    attachmentsDir: serverConfig.attachmentsDir,
                    threadId: attachmentThreadId,
                    attachment: { ...attachment, id: attachment.id },
                  });
            const attachmentId = original?.finalId ?? createAttachmentId(attachmentThreadId);
            if (!attachmentId) {
              return yield* new OrchestrationDispatchCommandError({
                message: "Failed to create a safe attachment id.",
              });
            }
            if (original) {
              claimedAttachmentPaths.push(original.finalPath);
            }
            const persistedAttachment = {
              type: "document" as const,
              id: attachmentId,
              name: attachment.name,
              mimeType: attachment.mimeType,
              sizeBytes: attachment.sizeBytes,
              extractedChars: text.length,
            };
            const extractedTextPath = resolveAttachmentRelativePath({
              attachmentsDir: serverConfig.attachmentsDir,
              relativePath: documentExtractedTextRelativePath(persistedAttachment),
            });
            if (!extractedTextPath) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Failed to resolve persisted path for '${attachment.name}'.`,
              });
            }
            // An original `.txt` already is the extracted text; keep it as is.
            if (extractedTextPath !== original?.finalPath) {
              yield* fileSystem.makeDirectory(path.dirname(extractedTextPath), {
                recursive: true,
              });
              yield* fileSystem.writeFileString(extractedTextPath, text);
              if (original) {
                claimedAttachmentPaths.push(extractedTextPath);
              }
            }
            documentContexts.push(
              formatDocumentContext({
                name: attachment.name,
                mimeType: attachment.mimeType,
                text,
              }),
            );
            return persistedAttachment;
          }

          if (!("dataUrl" in attachment)) {
            const claim = planAttachmentClaim({
              attachmentsDir: serverConfig.attachmentsDir,
              threadId: attachmentThreadId,
              attachmentId: attachment.id,
            });
            if (!claim.ok) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: ${claim.reason}.`,
              });
            }

            const info = yield* fileSystem.stat(claim.currentPath).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationDispatchCommandError({
                    message: `Attachment '${attachment.name}' cannot be sent: attachment not found.`,
                    cause,
                  }),
              ),
            );
            if (Number(info.size) !== attachment.sizeBytes) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: stored size does not match.`,
              });
            }

            const normalizedAttachment = {
              ...attachment,
              id: claim.finalId,
              mimeType: attachment.mimeType.toLowerCase(),
            };
            const expectedPath = resolveAttachmentPath({
              attachmentsDir: serverConfig.attachmentsDir,
              attachment: normalizedAttachment,
            });
            if (expectedPath !== claim.finalPath) {
              return yield* new OrchestrationDispatchCommandError({
                message: `Attachment '${attachment.name}' cannot be sent: attachment type does not match the upload.`,
              });
            }

            // Keep the pending copy until the turn succeeds. A failed thread
            // bootstrap can then retry with a fresh thread id. A copy, not a
            // hard link: an agent editing the delivered file in place must not
            // mutate the retry source.
            yield* fileSystem.copyFile(claim.currentPath, claim.finalPath).pipe(
              Effect.mapError(
                (cause) =>
                  new OrchestrationDispatchCommandError({
                    message: `Failed to claim attachment '${attachment.name}' for this thread.`,
                    cause,
                  }),
              ),
            );
            claimedAttachmentPaths.push(claim.finalPath);

            return normalizedAttachment;
          }

          const parsed = parseBase64DataUrl(attachment.dataUrl);
          if (!parsed || !parsed.mimeType.startsWith("image/")) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Invalid image attachment payload for '${attachment.name}'.`,
            });
          }

          const bytes = Buffer.from(parsed.base64, "base64");
          if (bytes.byteLength === 0 || bytes.byteLength > PROVIDER_SEND_TURN_MAX_IMAGE_BYTES) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Image attachment '${attachment.name}' is empty or too large.`,
            });
          }

          const attachmentId = createAttachmentId(attachmentThreadId);
          if (!attachmentId) {
            return yield* new OrchestrationDispatchCommandError({
              message: "Failed to create a safe attachment id.",
            });
          }

          const persistedAttachment = {
            type: "image" as const,
            id: attachmentId,
            name: attachment.name,
            mimeType: parsed.mimeType.toLowerCase(),
            sizeBytes: bytes.byteLength,
          };

          const attachmentPath = resolveAttachmentPath({
            attachmentsDir: serverConfig.attachmentsDir,
            attachment: persistedAttachment,
          });
          if (!attachmentPath) {
            return yield* new OrchestrationDispatchCommandError({
              message: `Failed to resolve persisted path for '${attachment.name}'.`,
            });
          }

          yield* fileSystem.makeDirectory(path.dirname(attachmentPath), { recursive: true }).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to create attachment directory for '${attachment.name}'.`,
                }),
            ),
          );
          yield* fileSystem.writeFile(attachmentPath, bytes).pipe(
            Effect.mapError(
              () =>
                new OrchestrationDispatchCommandError({
                  message: `Failed to persist attachment '${attachment.name}'.`,
                }),
            ),
          );

          return persistedAttachment;
        }),
      { concurrency: 1 },
    ).pipe(Effect.tapError(() => removeClaimedAttachmentPaths(claimedAttachmentPaths)));

    return {
      ...canonicalCommand,
      message: {
        ...canonicalCommand.message,
        text:
          documentContexts.length === 0
            ? canonicalCommand.message.text
            : [canonicalCommand.message.text, ...documentContexts].filter(Boolean).join("\n\n"),
        attachments: normalizedAttachments,
      },
    } satisfies OrchestrationCommand;
  });

export const cleanupFailedUploadedAttachments = Effect.fn(
  "Normalizer.cleanupFailedUploadedAttachments",
)(function* (command: ClientOrchestrationCommand, normalizedCommand: OrchestrationCommand) {
  // Avi Code addition: thread.fork claims uploads for the new branch the same
  // way thread.turn.start does, so both get the same cleanup.
  if (
    (command.type !== "thread.turn.start" && command.type !== "thread.fork") ||
    normalizedCommand.type !== command.type
  ) {
    return;
  }

  const serverConfig = yield* ServerConfig;
  const claimedPaths: string[] = [];
  for (const [index, attachment] of normalizedCommand.message.attachments.entries()) {
    const original = command.message.attachments[index];
    if (
      !original ||
      !("id" in original) ||
      parseThreadSegmentFromAttachmentId(original.id) !== PENDING_ATTACHMENT_THREAD_SEGMENT
    ) {
      continue;
    }

    // Avi Code addition: a document owns its original and its extracted text.
    for (const relativePath of attachmentRelativePaths(attachment)) {
      const claimedPath = resolveAttachmentRelativePath({
        attachmentsDir: serverConfig.attachmentsDir,
        relativePath,
      });
      if (claimedPath) {
        claimedPaths.push(claimedPath);
      }
    }
  }
  yield* removeClaimedAttachmentPaths(claimedPaths);
});
