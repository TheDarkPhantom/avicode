/**
 * Avi Code addition (upstream #9293): recognizing a `/compact` request.
 *
 * A user message of exactly `/compact`, with no attachments, is a request to
 * compact the thread's provider context rather than a prompt. The reactor
 * routes it to `ProviderService.compactThread`, the projection keeps its
 * pending row while messages queue behind it, and ingestion ties the
 * provider's compacted event back to it. All three must agree, so they share
 * this predicate.
 */
export function isCompactCommandMessage(
  message:
    | {
        readonly role: string;
        readonly text: string;
        readonly attachments?: ReadonlyArray<unknown> | undefined;
      }
    | undefined,
): boolean {
  return (
    message !== undefined &&
    message.role === "user" &&
    (message.attachments?.length ?? 0) === 0 &&
    message.text.trim().toLowerCase() === "/compact"
  );
}
