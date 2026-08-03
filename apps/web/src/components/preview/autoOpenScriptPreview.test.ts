import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import {
  previewUrlPort,
  resolveAutoOpenPreviewRequest,
  resolvePendingScriptPreviewOutcome,
  type PendingScriptPreview,
} from "./autoOpenScriptPreview";

const threadId = ThreadId.make("thread-1");
const otherThreadId = ThreadId.make("thread-2");

function discoveredServer(input: { readonly port: number; readonly threadId?: ThreadId | null }) {
  return {
    host: "127.0.0.1",
    port: input.port,
    url: `http://127.0.0.1:${input.port}`,
    processName: "node",
    pid: 4242,
    terminal:
      input.threadId === null || input.threadId === undefined
        ? null
        : { threadId: input.threadId, terminalId: "terminal-1" },
  };
}

describe("previewUrlPort", () => {
  it("reads an explicit port", () => {
    expect(previewUrlPort("http://localhost:5173")).toBe(5173);
    expect(previewUrlPort("https://127.0.0.1:8443/app")).toBe(8443);
  });

  it("falls back to the protocol's default port", () => {
    expect(previewUrlPort("http://localhost")).toBe(80);
    expect(previewUrlPort("https://localhost/")).toBe(443);
  });

  it("returns null for a URL it cannot parse or score", () => {
    expect(previewUrlPort("localhost:5173")).toBeNull();
    expect(previewUrlPort("")).toBeNull();
    expect(previewUrlPort("file:///tmp/index.html")).toBeNull();
  });
});

describe("resolveAutoOpenPreviewRequest", () => {
  const nowMs = 1_000;

  it("requests a preview only when the script opts in and has a URL", () => {
    expect(
      resolveAutoOpenPreviewRequest({
        script: { previewUrl: "http://localhost:5173", autoOpenPreview: true },
        threadId,
        nowMs,
        timeoutMs: 500,
      }),
    ).toEqual({
      threadId,
      url: "http://localhost:5173",
      port: 5173,
      expiresAtMs: 1_500,
    });
  });

  it("declines when the toggle is off, absent, or there is no preview URL", () => {
    expect(
      resolveAutoOpenPreviewRequest({
        script: { previewUrl: "http://localhost:5173", autoOpenPreview: false },
        threadId,
        nowMs,
      }),
    ).toBeNull();
    expect(
      resolveAutoOpenPreviewRequest({
        script: { previewUrl: "http://localhost:5173" },
        threadId,
        nowMs,
      }),
    ).toBeNull();
    expect(
      resolveAutoOpenPreviewRequest({ script: { autoOpenPreview: true }, threadId, nowMs }),
    ).toBeNull();
  });
});

describe("resolvePendingScriptPreviewOutcome", () => {
  const pending: PendingScriptPreview = {
    threadId,
    url: "http://localhost:5173",
    port: 5173,
    expiresAtMs: 10_000,
  };

  it("waits while nothing is listening on the script's port", () => {
    expect(resolvePendingScriptPreviewOutcome({ pending, discoveredPorts: [], nowMs: 1_000 })).toBe(
      "wait",
    );
  });

  it("opens once this thread is serving that port", () => {
    expect(
      resolvePendingScriptPreviewOutcome({
        pending,
        discoveredPorts: [discoveredServer({ port: 5173, threadId })],
        nowMs: 1_000,
      }),
    ).toBe("open");
  });

  it("ignores the same port served by another thread or by no terminal", () => {
    expect(
      resolvePendingScriptPreviewOutcome({
        pending,
        discoveredPorts: [
          discoveredServer({ port: 5173, threadId: otherThreadId }),
          discoveredServer({ port: 5173, threadId: null }),
        ],
        nowMs: 1_000,
      }),
    ).toBe("wait");
  });

  it("ignores a different port served by this thread", () => {
    expect(
      resolvePendingScriptPreviewOutcome({
        pending,
        discoveredPorts: [discoveredServer({ port: 3000, threadId })],
        nowMs: 1_000,
      }),
    ).toBe("wait");
  });

  it("gives up once the deadline passes", () => {
    expect(
      resolvePendingScriptPreviewOutcome({ pending, discoveredPorts: [], nowMs: 10_000 }),
    ).toBe("expire");
  });

  it("opens immediately when the URL has no port to wait for", () => {
    expect(
      resolvePendingScriptPreviewOutcome({
        pending: { ...pending, port: null },
        discoveredPorts: [],
        nowMs: 1_000,
      }),
    ).toBe("open");
  });
});
