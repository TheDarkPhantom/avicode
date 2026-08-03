import type { DiscoveredLocalServer, ProjectScript, ThreadId } from "@t3tools/contracts";

/**
 * Avi Code addition: `ProjectScript.autoOpenPreview` shipped with the in-app
 * browser panel but never had a runtime reader, so ticking "Open preview
 * automatically" in the script form did nothing at all. These helpers decide
 * when a just-started script's preview URL should take over the browser panel.
 *
 * The wait matters: a dev server needs a few seconds to bind its port, and
 * opening the preview the instant the command is written just shows a
 * connection-refused page. The port scanner already attributes listening ports
 * to the terminal that started them, so waiting for the script's own port to
 * appear is both accurate and free.
 */
export interface PendingScriptPreview {
  readonly threadId: ThreadId;
  readonly url: string;
  /** Null when the URL has no parseable port, which means "open immediately". */
  readonly port: number | null;
  readonly expiresAtMs: number;
}

/** A dev server that has not bound its port within this long is not coming. */
export const AUTO_OPEN_PREVIEW_TIMEOUT_MS = 60_000;

const DEFAULT_PORT_BY_PROTOCOL: Record<string, number> = {
  "http:": 80,
  "https:": 443,
};

export function previewUrlPort(url: string): number | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.port !== "") {
    const explicit = Number.parseInt(parsed.port, 10);
    return Number.isFinite(explicit) ? explicit : null;
  }
  return DEFAULT_PORT_BY_PROTOCOL[parsed.protocol] ?? null;
}

export function resolveAutoOpenPreviewRequest(input: {
  readonly script: Pick<ProjectScript, "previewUrl" | "autoOpenPreview">;
  readonly threadId: ThreadId;
  readonly nowMs: number;
  readonly timeoutMs?: number;
}): PendingScriptPreview | null {
  const url = input.script.previewUrl;
  if (!url || input.script.autoOpenPreview !== true) {
    return null;
  }
  return {
    threadId: input.threadId,
    url,
    port: previewUrlPort(url),
    expiresAtMs: input.nowMs + (input.timeoutMs ?? AUTO_OPEN_PREVIEW_TIMEOUT_MS),
  };
}

export type PendingScriptPreviewOutcome = "open" | "wait" | "expire";

/**
 * Matches on port rather than on the whole URL: the scanner reports the address
 * the server actually bound (often `127.0.0.1`), which rarely spells the same
 * as the `localhost` the user typed into the script form.
 *
 * Any terminal of the starting thread counts, not just the one the command was
 * written to. A script that spawns its real server through a wrapper gets
 * attributed to whichever terminal the scanner could see, and insisting on an
 * exact terminal would make the feature quietly do nothing for those.
 */
export function resolvePendingScriptPreviewOutcome(input: {
  readonly pending: PendingScriptPreview;
  readonly discoveredPorts: ReadonlyArray<DiscoveredLocalServer>;
  readonly nowMs: number;
}): PendingScriptPreviewOutcome {
  if (input.pending.port === null) {
    return "open";
  }
  const isServing = input.discoveredPorts.some(
    (server) =>
      server.port === input.pending.port && server.terminal?.threadId === input.pending.threadId,
  );
  if (isServing) {
    return "open";
  }
  return input.nowMs >= input.pending.expiresAtMs ? "expire" : "wait";
}
