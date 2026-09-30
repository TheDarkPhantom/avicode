import type {
  ModelSelection,
  ProviderDriverKind,
  ProviderInstanceId,
  UserInputQuestion,
} from "@t3tools/contracts";
import {
  CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
  isClaudeResumeCompactionQuestion,
} from "@t3tools/shared/claudeCompaction";
import {
  resolveSelectableProviderInstanceEntry,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { getTriggerDisplayModelName, type ModelEsque } from "./providerIconUtils";

export const CLAUDE_RESUME_COMPACTION_MINUTES = 70;
export const CLAUDE_RESUME_COMPACTION_TOKENS = 100_000;

/** Whether this provider instance advertises the `/compact` command. */
export function providerSupportsManualCompaction(
  provider: ProviderInstanceEntry | null | undefined,
): boolean {
  return provider?.snapshot.slashCommands.some((command) => command.name === "compact") ?? false;
}

/**
 * Whether `/compact` can run for the thread's provider. A thread locked to an
 * instance can only fall back to instances sharing its continuation group,
 * since another group cannot resume the conversation it would compact.
 */
export function hasAvailableCompactionProvider(input: {
  readonly providers: ReadonlyArray<ProviderInstanceEntry>;
  readonly driverKind: ProviderDriverKind;
  readonly instanceId: ProviderInstanceId | null;
  readonly lockedInstanceId: ProviderInstanceId | null;
}): boolean {
  const driverProviders = input.providers.filter(
    (provider) => provider.driverKind === input.driverKind,
  );
  const lockedContinuationGroupKey = input.lockedInstanceId
    ? driverProviders.find((provider) => provider.instanceId === input.lockedInstanceId)
        ?.continuationGroupKey
    : undefined;
  const compatibleProviders = lockedContinuationGroupKey
    ? driverProviders.filter(
        (provider) => provider.continuationGroupKey === lockedContinuationGroupKey,
      )
    : driverProviders;

  return providerSupportsManualCompaction(
    resolveSelectableProviderInstanceEntry(compatibleProviders, input.instanceId ?? undefined),
  );
}

/** Whether the user answered Claude's native resume dialog with "Don't ask again". */
export function hasDismissedResumeCompaction(
  activities: ReadonlyArray<{ readonly kind: string; readonly payload: unknown }>,
): boolean {
  return activities.some((activity) => {
    if (activity.kind !== "user-input.resolved") return false;
    const payload = activity.payload;
    if (!payload || typeof payload !== "object") return false;
    const answers = (payload as { readonly answers?: unknown }).answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) return false;

    return Object.entries(answers).some(
      ([question, answer]) =>
        isClaudeResumeCompactionQuestion(question) &&
        answer === CLAUDE_RESUME_COMPACTION_NEVER_ANSWER,
    );
  });
}

/**
 * The question of a pending user-input request that is Claude's resume
 * compaction dialog, or null for any other request. The composer renders
 * that dialog as a dedicated prompt instead of the generic questionnaire.
 */
export function findClaudeResumeCompactionQuestion(prompt: {
  readonly questions: ReadonlyArray<UserInputQuestion>;
}): UserInputQuestion | null {
  if (prompt.questions.length !== 1) return null;
  const question = prompt.questions[0];
  return question && isClaudeResumeCompactionQuestion(question.question) ? question : null;
}

/** Mirrors Claude's own old-session thresholds for the resume banner. */
export function shouldOfferResumeCompaction(input: {
  readonly provider: string | null | undefined;
  readonly usedTokens: number | null | undefined;
  readonly updatedAt: string | null | undefined;
  readonly now: number;
}): boolean {
  const offerAt = resumeCompactionOfferTime(input);
  return offerAt !== null && input.now >= offerAt;
}

/**
 * When the resume banner becomes eligible (epoch ms), or null when it never
 * will for this snapshot. Lets the banner schedule one timer instead of
 * re-rendering on a clock.
 */
export function resumeCompactionOfferTime(input: {
  readonly provider: string | null | undefined;
  readonly usedTokens: number | null | undefined;
  readonly updatedAt: string | null | undefined;
}): number | null {
  if (
    input.provider !== "claudeAgent" ||
    (input.usedTokens ?? 0) < CLAUDE_RESUME_COMPACTION_TOKENS
  ) {
    return null;
  }
  const updatedAt = Date.parse(input.updatedAt ?? "");
  return Number.isFinite(updatedAt) ? updatedAt + CLAUDE_RESUME_COMPACTION_MINUTES * 60_000 : null;
}

export function resolveContextWindowModelDisplayName(
  selection: ModelSelection | null | undefined,
  modelOptionsByInstance: ReadonlyMap<ProviderInstanceId, ReadonlyArray<ModelEsque>>,
): string | null {
  if (!selection) {
    return null;
  }

  const selectedModel = modelOptionsByInstance
    .get(selection.instanceId)
    ?.find((model) => model.slug === selection.model);

  return selectedModel ? getTriggerDisplayModelName(selectedModel) : selection.model;
}

export function formatContextWindowCompactionMessage(
  modelDisplayName: string | null | undefined,
  autoCompactThreshold?: number | null,
): string {
  if (typeof autoCompactThreshold === "number" && autoCompactThreshold > 0) {
    return `Compacts automatically at ${autoCompactThreshold.toLocaleString("en-US")} tokens.`;
  }
  return modelDisplayName
    ? `Context for ${modelDisplayName} compacts automatically when needed.`
    : "Context compacts automatically when needed.";
}

/**
 * Where the auto-compact threshold sits on the usage bar, as a 0-100
 * percentage, or null when there is no threshold or window to place it on.
 */
export function resolveAutoCompactMarkerPercent(
  autoCompactThreshold: number | null | undefined,
  maxTokens: number | null | undefined,
): number | null {
  if (
    typeof autoCompactThreshold !== "number" ||
    typeof maxTokens !== "number" ||
    autoCompactThreshold <= 0 ||
    maxTokens <= 0 ||
    autoCompactThreshold >= maxTokens
  ) {
    return null;
  }
  return (autoCompactThreshold / maxTokens) * 100;
}
