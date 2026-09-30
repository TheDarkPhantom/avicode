import { ProviderDriverKind, ProviderInstanceId, type ServerProvider } from "@t3tools/contracts";
import { formatClaudeResumeCompactionQuestion } from "@t3tools/shared/claudeCompaction";
import { describe, expect, it } from "vite-plus/test";
import { deriveProviderInstanceEntries } from "../../providerInstances";
import {
  CLAUDE_RESUME_COMPACTION_MINUTES,
  findClaudeResumeCompactionQuestion,
  formatContextWindowCompactionMessage,
  hasAvailableCompactionProvider,
  hasDismissedResumeCompaction,
  providerSupportsManualCompaction,
  resolveAutoCompactMarkerPercent,
  resolveContextWindowModelDisplayName,
  resumeCompactionOfferTime,
  shouldOfferResumeCompaction,
} from "./ContextWindowMeter.logic";

const CLAUDE = ProviderDriverKind.make("claudeAgent");

function claudeProvider(input: {
  instanceId: string;
  continuationGroupKey: string;
  enabled?: boolean;
  compact?: boolean;
}): ServerProvider {
  return {
    instanceId: ProviderInstanceId.make(input.instanceId),
    driver: CLAUDE,
    continuation: { groupKey: input.continuationGroupKey },
    enabled: input.enabled ?? true,
    installed: true,
    version: null,
    status: "ready",
    auth: { status: "authenticated" },
    checkedAt: "2026-08-24T12:00:00.000Z",
    models: [],
    slashCommands: input.compact === false ? [] : [{ name: "compact", description: "" }],
    skills: [],
  };
}

describe("hasAvailableCompactionProvider", () => {
  const originalInstanceId = ProviderInstanceId.make("claude_original");

  it("rejects a fallback in a different locked continuation group", () => {
    const providers = deriveProviderInstanceEntries([
      claudeProvider({
        instanceId: originalInstanceId,
        continuationGroupKey: "claude:home:/original",
        enabled: false,
      }),
      claudeProvider({ instanceId: "claude_other", continuationGroupKey: "claude:home:/other" }),
    ]);

    expect(
      hasAvailableCompactionProvider({
        providers,
        driverKind: CLAUDE,
        instanceId: originalInstanceId,
        lockedInstanceId: originalInstanceId,
      }),
    ).toBe(false);
  });

  it("accepts an enabled fallback in the locked continuation group", () => {
    const providers = deriveProviderInstanceEntries([
      claudeProvider({
        instanceId: originalInstanceId,
        continuationGroupKey: "claude:home:/original",
        enabled: false,
      }),
      claudeProvider({
        instanceId: "claude_fallback",
        continuationGroupKey: "claude:home:/original",
      }),
    ]);

    expect(
      hasAvailableCompactionProvider({
        providers,
        driverKind: CLAUDE,
        instanceId: originalInstanceId,
        lockedInstanceId: originalInstanceId,
      }),
    ).toBe(true);
  });

  it("requires the provider to advertise /compact", () => {
    const providers = deriveProviderInstanceEntries([
      claudeProvider({ instanceId: "claude", continuationGroupKey: "claude", compact: false }),
    ]);

    expect(providerSupportsManualCompaction(providers[0])).toBe(false);
    expect(
      hasAvailableCompactionProvider({
        providers,
        driverKind: CLAUDE,
        instanceId: ProviderInstanceId.make("claude"),
        lockedInstanceId: null,
      }),
    ).toBe(false);
  });
});

describe("resolveContextWindowModelDisplayName", () => {
  it("uses the selected model from the exact provider instance", () => {
    const primaryInstanceId = ProviderInstanceId.make("codex");
    const selectedInstanceId = ProviderInstanceId.make("codex-work");
    const modelOptionsByInstance = new Map([
      [
        primaryInstanceId,
        [{ slug: "gpt-5.6-sol", name: "Primary profile model", shortName: "Primary" }],
      ],
      [selectedInstanceId, [{ slug: "gpt-5.6-sol", name: "GPT-5.6 Sol", shortName: "5.6 Sol" }]],
    ]);

    expect(
      resolveContextWindowModelDisplayName(
        { instanceId: selectedInstanceId, model: "gpt-5.6-sol" },
        modelOptionsByInstance,
      ),
    ).toBe("5.6 Sol");
  });

  it("falls back to the selected model slug when model metadata is unavailable", () => {
    expect(
      resolveContextWindowModelDisplayName(
        { instanceId: ProviderInstanceId.make("codex-work"), model: "custom-model" },
        new Map(),
      ),
    ).toBe("custom-model");
  });
});

describe("formatContextWindowCompactionMessage", () => {
  it("describes compaction in terms of the selected model", () => {
    expect(formatContextWindowCompactionMessage("GPT-5.6 Sol")).toBe(
      "Context for GPT-5.6 Sol compacts automatically when needed.",
    );
  });

  it("uses neutral copy when the model is unavailable", () => {
    expect(formatContextWindowCompactionMessage(null)).toBe(
      "Context compacts automatically when needed.",
    );
  });

  it("shows the configured auto-compaction threshold", () => {
    expect(formatContextWindowCompactionMessage("Claude Sonnet 5", 300_000)).toBe(
      "Compacts automatically at 300,000 tokens.",
    );
  });
});

describe("resolveAutoCompactMarkerPercent", () => {
  it("places the threshold on the usage bar", () => {
    expect(resolveAutoCompactMarkerPercent(750_000, 1_000_000)).toBe(75);
  });

  it("has no marker without a threshold inside the window", () => {
    expect(resolveAutoCompactMarkerPercent(null, 1_000_000)).toBeNull();
    expect(resolveAutoCompactMarkerPercent(200_000, null)).toBeNull();
    expect(resolveAutoCompactMarkerPercent(1_000_000, 1_000_000)).toBeNull();
    expect(resolveAutoCompactMarkerPercent(0, 1_000_000)).toBeNull();
  });
});

describe("shouldOfferResumeCompaction", () => {
  const now = Date.parse("2026-08-24T12:00:00.000Z");

  it("matches Claude's old-session age and context thresholds", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 100_000,
        updatedAt: "2026-08-24T10:50:00.000Z",
        now,
      }),
    ).toBe(true);
  });

  it("does not prompt for recent or smaller sessions", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 99_999,
        updatedAt: "2026-08-24T10:00:00.000Z",
        now,
      }),
    ).toBe(false);
    expect(
      shouldOfferResumeCompaction({
        provider: "claudeAgent",
        usedTokens: 200_000,
        updatedAt: "2026-08-24T10:51:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("does not show Claude's resume prompt for another provider", () => {
    expect(
      shouldOfferResumeCompaction({
        provider: "codex",
        usedTokens: 300_000,
        updatedAt: "2026-08-24T09:00:00.000Z",
        now,
      }),
    ).toBe(false);
  });

  it("schedules the offer at the idle threshold", () => {
    expect(
      resumeCompactionOfferTime({
        provider: "claudeAgent",
        usedTokens: 150_000,
        updatedAt: "2026-08-24T10:00:00.000Z",
      }),
    ).toBe(Date.parse("2026-08-24T10:00:00.000Z") + CLAUDE_RESUME_COMPACTION_MINUTES * 60_000);
    expect(
      resumeCompactionOfferTime({ provider: "claudeAgent", usedTokens: 150_000, updatedAt: "" }),
    ).toBeNull();
  });
});

describe("hasDismissedResumeCompaction", () => {
  it("recognizes the native resume dialog's permanent dismissal", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: {
            answers: {
              "This session is 2h 0m old and uses 250,000 tokens. Compact it before continuing?":
                "Don't ask again",
            },
          },
        },
      ]),
    ).toBe(true);
  });

  it("ignores the same answer on an unrelated question", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: { answers: { "Show this setup reminder?": "Don't ask again" } },
        },
      ]),
    ).toBe(false);
  });

  it("ignores unrelated questions that end with Claude's compaction prompt", () => {
    expect(
      hasDismissedResumeCompaction([
        {
          kind: "user-input.resolved",
          payload: {
            answers: {
              "The build cache is large. Compact it before continuing?": "Don't ask again",
            },
          },
        },
      ]),
    ).toBe(false);
  });

  it("ignores pending questions and malformed resolved payloads", () => {
    expect(
      hasDismissedResumeCompaction([
        { kind: "user-input.requested", payload: { answers: { question: "Don't ask again" } } },
        { kind: "user-input.resolved", payload: null },
        { kind: "user-input.resolved", payload: { answers: ["Don't ask again"] } },
      ]),
    ).toBe(false);
  });
});

describe("findClaudeResumeCompactionQuestion", () => {
  const resumeQuestion = {
    id: "resume",
    header: "Resume session",
    question: formatClaudeResumeCompactionQuestion({ ageMinutes: 125, estimatedTokens: 250_000 }),
    options: [
      { label: "Compact and continue", description: "" },
      { label: "Keep full history", description: "" },
      { label: "Don't ask again", description: "" },
    ],
    multiSelect: false,
  };

  it("recognizes Claude's resume dialog", () => {
    expect(findClaudeResumeCompactionQuestion({ questions: [resumeQuestion] })).toBe(
      resumeQuestion,
    );
  });

  it("leaves other questions to the generic questionnaire", () => {
    expect(
      findClaudeResumeCompactionQuestion({
        questions: [{ ...resumeQuestion, question: "Which database should I use?" }],
      }),
    ).toBeNull();
    expect(
      findClaudeResumeCompactionQuestion({ questions: [resumeQuestion, resumeQuestion] }),
    ).toBeNull();
  });
});
