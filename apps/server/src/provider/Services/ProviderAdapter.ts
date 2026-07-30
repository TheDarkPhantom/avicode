/**
 * ProviderAdapter - Provider-specific runtime adapter contract.
 *
 * Defines the provider-native session/protocol operations that `ProviderService`
 * routes to after resolving the target provider. Implementations should focus
 * on provider behavior only and avoid cross-provider orchestration concerns.
 *
 * @module ProviderAdapter
 */
import type {
  ApprovalRequestId,
  ProviderApprovalDecision,
  ProviderDriverKind,
  ProviderUserInputAnswers,
  ProviderRuntimeEvent,
  ProviderSendTurnInput,
  ProviderSession,
  ProviderSessionStartInput,
  ProviderSideQuestionChunk,
  ThreadId,
  ProviderTurnStartResult,
  TurnId,
} from "@t3tools/contracts";
import type * as Effect from "effect/Effect";
import type * as Stream from "effect/Stream";

export type ProviderSessionModelSwitchMode = "in-session" | "unsupported";

/**
 * Avi Code addition: whether `/btw` can be answered on this backend.
 *
 * "fork-session" means the backend can branch the live conversation, answer
 * once against that branch, and discard it. Anything else is "unsupported" —
 * answering a side question without the thread's context would look like the
 * feature working while quietly being useless, so the command is hidden
 * instead of degraded.
 */
export type ProviderSideQuestionMode = "fork-session" | "unsupported";

export interface ProviderAdapterCapabilities {
  /**
   * Declares whether changing the model on an existing session is supported.
   */
  readonly sessionModelSwitch: ProviderSessionModelSwitchMode;
  /**
   * Avi Code addition. Declares whether `/btw` side questions are answerable.
   */
  readonly sideQuestion: ProviderSideQuestionMode;
}

export interface ProviderThreadTurnSnapshot {
  readonly id: TurnId;
  readonly items: ReadonlyArray<unknown>;
}

export interface ProviderThreadSnapshot {
  readonly threadId: ThreadId;
  readonly turns: ReadonlyArray<ProviderThreadTurnSnapshot>;
}

/**
 * Avi Code addition: result of branching a provider thread.
 *
 * `providerThreadId` is the backend's id for the new branch (a Codex thread id,
 * a Claude session id). Callers persist it as the branch thread's resume cursor
 * so its first session resumes the already-forked history.
 */
export interface ProviderForkResult {
  readonly providerThreadId: string;
}

export interface ProviderAdapterShape<TError> {
  /**
   * Provider kind implemented by this adapter.
   */
  readonly provider: ProviderDriverKind;
  readonly capabilities: ProviderAdapterCapabilities;

  /**
   * Start a provider-backed session.
   */
  readonly startSession: (
    input: ProviderSessionStartInput,
  ) => Effect.Effect<ProviderSession, TError>;

  /**
   * Send a turn to an active provider session.
   */
  readonly sendTurn: (
    input: ProviderSendTurnInput,
  ) => Effect.Effect<ProviderTurnStartResult, TError>;

  /**
   * Interrupt an active turn.
   */
  readonly interruptTurn: (threadId: ThreadId, turnId?: TurnId) => Effect.Effect<void, TError>;

  /**
   * Avi Code addition: answer a `/btw` side question about this thread.
   *
   * Streams the answer and leaves nothing behind — no turn, no runtime events,
   * no change to the resume cursor. It runs against a throwaway branch of the
   * conversation, so it can be asked while a turn is mid-flight without
   * touching it.
   *
   * Adapters whose `capabilities.sideQuestion` is "unsupported" must fail
   * rather than answer without the thread's context.
   */
  readonly askSideQuestion: (
    threadId: ThreadId,
    question: string,
  ) => Stream.Stream<ProviderSideQuestionChunk, TError>;

  /**
   * Respond to an interactive approval request.
   */
  readonly respondToRequest: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  ) => Effect.Effect<void, TError>;

  /**
   * Respond to a structured user-input request.
   */
  readonly respondToUserInput: (
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    answers: ProviderUserInputAnswers,
  ) => Effect.Effect<void, TError>;

  /**
   * Stop one provider session.
   */
  readonly stopSession: (threadId: ThreadId) => Effect.Effect<void, TError>;

  /**
   * List currently active provider sessions for this adapter.
   */
  readonly listSessions: () => Effect.Effect<ReadonlyArray<ProviderSession>>;

  /**
   * Check whether this adapter owns an active session id.
   */
  readonly hasSession: (threadId: ThreadId) => Effect.Effect<boolean>;

  /**
   * Read a provider thread snapshot.
   */
  readonly readThread: (threadId: ThreadId) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /**
   * Roll back a provider thread by N turns.
   */
  readonly rollbackThread: (
    threadId: ThreadId,
    numTurns: number,
  ) => Effect.Effect<ProviderThreadSnapshot, TError>;

  /**
   * Avi Code addition: branch a provider thread at an earlier point.
   *
   * Keeps turns up to and including `lastTurnId` (or nothing, when null) and
   * returns the new provider-side thread/session id. The source thread is left
   * untouched — this is the non-destructive counterpart to `rollbackThread`.
   *
   * Adapters whose backend cannot branch should fail rather than silently
   * degrading to a fresh, context-free thread.
   */
  readonly forkThread: (
    sourceThreadId: ThreadId,
    lastTurnId: TurnId | null,
  ) => Effect.Effect<ProviderForkResult, TError>;

  /**
   * Stop all sessions owned by this adapter.
   */
  readonly stopAll: () => Effect.Effect<void, TError>;

  /**
   * Canonical runtime event stream emitted by this adapter.
   */
  readonly streamEvents: Stream.Stream<ProviderRuntimeEvent>;
}
