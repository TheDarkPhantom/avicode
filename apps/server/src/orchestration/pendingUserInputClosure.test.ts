import { describe, expect, it } from "vite-plus/test";

import { deriveOpenUserInputRequestIds } from "./pendingUserInputClosure.ts";

const requested = (requestId: string) => ({
  kind: "user-input.requested",
  payload: { requestId },
});

const resolved = (requestId: string) => ({
  kind: "user-input.resolved",
  payload: { requestId },
});

const respondFailed = (requestId: string, detail: string) => ({
  kind: "provider.user-input.respond.failed",
  payload: { requestId, detail },
});

describe("deriveOpenUserInputRequestIds", () => {
  it("returns a request with no later close", () => {
    expect(deriveOpenUserInputRequestIds([requested("req-1")])).toEqual(["req-1"]);
  });

  it("drops a request that was resolved", () => {
    expect(deriveOpenUserInputRequestIds([requested("req-1"), resolved("req-1")])).toEqual([]);
  });

  it("keeps other requests when one resolves", () => {
    expect(
      deriveOpenUserInputRequestIds([requested("req-1"), requested("req-2"), resolved("req-1")]),
    ).toEqual(["req-2"]);
  });

  it("drops a request a stale-failure row already settled", () => {
    // Threads carry these rows from before questions closed themselves; a boot
    // sweep must not reopen what they already dealt with.
    for (const detail of [
      "Stale pending user-input request: req-1. Provider callback state does not survive app restarts.",
      "Unknown pending user-input request: req-1",
      "Unknown pending user input request: req-1",
      "Unknown pending Codex user input request: req-1",
    ]) {
      expect(
        deriveOpenUserInputRequestIds([requested("req-1"), respondFailed("req-1", detail)]),
      ).toEqual([]);
    }
  });

  it("keeps a request whose response failed for an unrelated reason", () => {
    expect(
      deriveOpenUserInputRequestIds([
        requested("req-1"),
        respondFailed("req-1", "Answer 'yes' is not one of the offered options."),
      ]),
    ).toEqual(["req-1"]);
  });

  it("collapses a request id repeated across turns to one entry", () => {
    expect(deriveOpenUserInputRequestIds([requested("req-1"), requested("req-1")])).toEqual([
      "req-1",
    ]);
  });

  it("reopens a request id reused after a close", () => {
    expect(
      deriveOpenUserInputRequestIds([requested("req-1"), resolved("req-1"), requested("req-1")]),
    ).toEqual(["req-1"]);
  });

  it("ignores activities with no request id and unrelated kinds", () => {
    expect(
      deriveOpenUserInputRequestIds([
        { kind: "user-input.requested", payload: null },
        { kind: "user-input.requested", payload: { questions: [] } },
        { kind: "approval.requested", payload: { requestId: "req-approval" } },
        requested("req-1"),
      ]),
    ).toEqual(["req-1"]);
  });

  it("returns nothing for an empty activity list", () => {
    expect(deriveOpenUserInputRequestIds([])).toEqual([]);
  });
});
