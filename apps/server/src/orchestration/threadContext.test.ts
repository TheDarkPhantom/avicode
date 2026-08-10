import { describe, expect, it } from "vite-plus/test";
import { ThreadId } from "@t3tools/contracts";

import {
  serializeReferencedThreadContext,
  THREAD_CONTEXT_SERIALIZED_CHAR_LIMIT,
} from "./threadContext.ts";

describe("serializeReferencedThreadContext", () => {
  it("preserves full ordered transcripts and marks them as untrusted", () => {
    const result = serializeReferencedThreadContext([
      {
        id: ThreadId.make("source-1"),
        title: 'API "Decisions"',
        projectTitle: "Alpha & Beta",
        messages: [
          { role: "user", text: "Use REST.", createdAt: "2026-07-29T10:00:00.000Z" },
          {
            role: "assistant",
            text: "Decision recorded.",
            createdAt: "2026-07-29T10:01:00.000Z",
          },
        ],
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain("untrusted historical conversation");
    expect(result.text).toContain('title="API &quot;Decisions&quot;"');
    expect(result.text).toContain('project="Alpha &amp; Beta"');
    expect(result.text.indexOf("Use REST.")).toBeLessThan(
      result.text.indexOf("Decision recorded."),
    );
  });

  it("rejects oversized context without truncating it", () => {
    const result = serializeReferencedThreadContext([
      {
        id: ThreadId.make("source-large"),
        title: "Large thread",
        projectTitle: "Project",
        messages: [
          {
            role: "user",
            text: "x".repeat(THREAD_CONTEXT_SERIALIZED_CHAR_LIMIT),
            createdAt: "2026-07-29T10:00:00.000Z",
          },
        ],
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.detail).toContain("Remove one or more referenced threads");
  });

  it("includes proposed-plan output when the provider stored no assistant message", () => {
    const result = serializeReferencedThreadContext([
      {
        id: ThreadId.make("review-thread"),
        title: "Audit proposed plan",
        projectTitle: "Project",
        messages: [
          {
            role: "user",
            text: "Review the plan.",
            createdAt: "2026-08-10T10:00:00.000Z",
          },
        ],
        proposedPlans: [
          {
            id: "review-plan",
            planMarkdown: "# Audit\n\nBlocking finding: preserve the context payload.",
            createdAt: "2026-08-10T10:01:00.000Z",
            implementedAt: null,
          },
        ],
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.text).toContain('<proposed_plan id="review-plan"');
    expect(result.text).toContain("Blocking finding: preserve the context payload.");
  });
});
