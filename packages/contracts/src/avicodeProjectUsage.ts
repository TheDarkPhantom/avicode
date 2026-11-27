import * as Rpc from "effect/rpc/Rpc";
import * as Schema from "effect/Schema";

import { EnvironmentAuthorizationError } from "./auth.ts";
import { NonNegativeInt, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";
import { UsageDay } from "./usage.ts";

export const AVICODE_WS_METHODS = {
  avicodeGetProjectUsage: "avicode.getProjectUsage",
  avicodeGetThreadUsage: "avicode.getThreadUsage",
} as const;

/** The Usage page's window: whole days in `timeZone`, or the exact instants when both are set. */
export const ProjectUsageInput = Schema.Struct({
  sinceDay: UsageDay,
  untilDay: UsageDay,
  timeZone: TrimmedNonEmptyString,
  sinceTime: Schema.optional(TrimmedNonEmptyString),
  untilTime: Schema.optional(TrimmedNonEmptyString),
});
export type ProjectUsageInput = typeof ProjectUsageInput.Type;

/** One provider account and model inside a repository. `inputTokens` includes cache reads and writes. */
export const ProjectUsageEntry = Schema.Struct({
  providerInstanceId: TrimmedNonEmptyString,
  driver: TrimmedNonEmptyString,
  model: Schema.NullOr(TrimmedNonEmptyString),
  turns: NonNegativeInt,
  inputTokens: NonNegativeInt,
  cachedInputTokens: NonNegativeInt,
  cacheCreationTokens: NonNegativeInt,
  outputTokens: NonNegativeInt,
  /** Null when no turn here has a cost: unreported, not free. */
  costUsd: Schema.NullOr(Schema.Number),
  unpricedTurns: NonNegativeInt,
});
export type ProjectUsageEntry = typeof ProjectUsageEntry.Type;

export const ProjectUsageProject = Schema.Struct({
  /** Null for turns whose thread no longer names a project. */
  projectId: Schema.NullOr(TrimmedNonEmptyString),
  title: Schema.NullOr(Schema.String),
  workspaceRoot: Schema.NullOr(Schema.String),
  entries: Schema.Array(ProjectUsageEntry),
});
export type ProjectUsageProject = typeof ProjectUsageProject.Type;

export const ProjectUsageSummary = Schema.Struct({
  readAt: Schema.String,
  projects: Schema.Array(ProjectUsageProject),
});
export type ProjectUsageSummary = typeof ProjectUsageSummary.Type;

/** Every turn one thread has recorded, split by provider account and model like a repository. */
export const ThreadUsageInput = Schema.Struct({ threadId: ThreadId });
export type ThreadUsageInput = typeof ThreadUsageInput.Type;

export const ThreadUsageSummary = Schema.Struct({
  readAt: Schema.String,
  entries: Schema.Array(ProjectUsageEntry),
});
export type ThreadUsageSummary = typeof ThreadUsageSummary.Type;

export class ProjectUsageReadError extends Schema.TaggedError<ProjectUsageReadError>()(
  "ProjectUsageReadError",
  {
    reason: Schema.Literals(["invalidWindow", "queryFailed"]),
    cause: Schema.optional(Schema.Defect()),
  },
) {
  override get message(): string {
    return this.reason === "invalidWindow"
      ? "The usage window is not valid."
      : "Usage by repository could not be read.";
  }
}

export const WsAviCodeGetProjectUsageRpc = Rpc.make(AVICODE_WS_METHODS.avicodeGetProjectUsage, {
  payload: ProjectUsageInput,
  success: ProjectUsageSummary,
  error: Schema.Union([EnvironmentAuthorizationError, ProjectUsageReadError]),
});

export const WsAviCodeGetThreadUsageRpc = Rpc.make(AVICODE_WS_METHODS.avicodeGetThreadUsage, {
  payload: ThreadUsageInput,
  success: ThreadUsageSummary,
  error: Schema.Union([EnvironmentAuthorizationError, ProjectUsageReadError]),
});
