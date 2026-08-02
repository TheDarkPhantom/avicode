/**
 * Avi Code addition: client state for signing a Claude instance in from
 * Settings.
 *
 * Modelled on `cloud/relayClientInstallDialog.ts` — a module-level store the
 * dialog reads through `useSyncExternalStore`, fed by a long-running effect
 * rather than by React. That shape is what the flow needs: one server-side CLI
 * process spans the whole dialog, emitting progress the dialog renders and
 * blocking on a code the dialog collects.
 *
 * Cancellation is explicit rather than left to atom teardown, because the
 * server ties the CLI's lifetime to the stream: resolving the cancel promise
 * interrupts the stream, which closes the scope and kills the CLI. Without it,
 * closing the dialog would leave a process parked on stdin.
 *
 * @module components/settings/claudeLoginSession
 */
import { EnvironmentRegistry } from "@t3tools/client-runtime/connection";
import { request, runStream } from "@t3tools/client-runtime/rpc";
import { createRuntimeCommand } from "@t3tools/client-runtime/state/runtime";
import { WS_METHODS, type EnvironmentId, type ProviderInstanceId } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";

import { connectionAtomRuntime } from "../../connection/runtime";

export type ClaudeLoginPhase =
  /** No sign-in has been started; the dialog is closed. */
  | { readonly status: "idle" }
  /** The CLI is starting and has not produced an authorization URL yet. */
  | { readonly status: "starting" }
  /**
   * The URL is available. `awaitingCode` flips once the CLI is actually
   * blocked on stdin, which is when a submitted code can be delivered.
   */
  | {
      readonly status: "authorizing";
      readonly url: string;
      readonly awaitingCode: boolean;
      readonly rejection: string | null;
      readonly submitting: boolean;
    }
  | { readonly status: "succeeded"; readonly email: string | null }
  | { readonly status: "failed"; readonly message: string };

export interface ClaudeLoginSessionState {
  readonly instanceId: ProviderInstanceId | null;
  readonly displayName: string;
  readonly phase: ClaudeLoginPhase;
}

const IDLE: ClaudeLoginSessionState = {
  instanceId: null,
  displayName: "Claude",
  phase: { status: "idle" },
};

let state: ClaudeLoginSessionState = IDLE;
const listeners = new Set<() => void>();
/** Resolving this interrupts the in-flight stream, killing the server-side CLI. */
let cancelSession: (() => void) | null = null;

function publish(next: ClaudeLoginSessionState) {
  state = next;
  for (const listener of listeners) listener();
}

export function readClaudeLoginSession(): ClaudeLoginSessionState {
  return state;
}

export function subscribeClaudeLoginSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Apply one server event to the store. Exported for tests. */
export function applyClaudeLoginEvent(
  current: ClaudeLoginPhase,
  event: {
    readonly type: string;
    readonly url?: string;
    readonly message?: string;
    readonly email?: string | null;
  },
): ClaudeLoginPhase {
  switch (event.type) {
    case "started":
      return { status: "starting" };
    case "authorizationUrl":
      return {
        status: "authorizing",
        url: event.url ?? "",
        awaitingCode: false,
        rejection: null,
        submitting: false,
      };
    case "awaitingCode":
      return current.status === "authorizing"
        ? { ...current, awaitingCode: true, submitting: false }
        : current;
    case "codeRejected":
      // Non-terminal: the CLI re-prompts, so the dialog reopens its input
      // rather than closing on the error.
      return current.status === "authorizing"
        ? {
            ...current,
            awaitingCode: true,
            submitting: false,
            rejection: event.message ?? "That code was not accepted.",
          }
        : current;
    case "succeeded":
      return { status: "succeeded", email: event.email ?? null };
    case "failed":
      return { status: "failed", message: event.message ?? "Sign-in failed." };
    default:
      return current;
  }
}

const startCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:settings:claude-login-start",
  execute: (input: {
    readonly environmentId: EnvironmentId;
    readonly instanceId: ProviderInstanceId;
    readonly cancelled: Promise<void>;
  }) =>
    Effect.gen(function* () {
      const registry = yield* EnvironmentRegistry;
      yield* registry
        .runStream(
          input.environmentId,
          runStream(WS_METHODS.claudeLoginStart, { instanceId: input.instanceId }),
        )
        .pipe(
          Stream.runForEach((event) =>
            Effect.sync(() => {
              publish({ ...state, phase: applyClaudeLoginEvent(state.phase, event) });
            }),
          ),
          // Closing the dialog wins the race and interrupts the stream, which
          // is what kills the CLI on the server.
          Effect.race(Effect.promise(() => input.cancelled)),
        );
    }),
});

const submitCommand = createRuntimeCommand(connectionAtomRuntime, {
  label: "web:settings:claude-login-submit-code",
  execute: (input: {
    readonly environmentId: EnvironmentId;
    readonly instanceId: ProviderInstanceId;
    readonly code: string;
  }) =>
    Effect.gen(function* () {
      const registry = yield* EnvironmentRegistry;
      yield* registry.run(
        input.environmentId,
        request(WS_METHODS.claudeLoginSubmitCode, {
          instanceId: input.instanceId,
          code: input.code,
        }),
      );
    }),
});

export const claudeLoginStartCommand = startCommand;
export const claudeLoginSubmitCommand = submitCommand;

/** Open the dialog for an instance and mark the session as starting. */
export function openClaudeLoginSession(
  instanceId: ProviderInstanceId,
  displayName: string,
): Promise<void> {
  cancelSession?.();
  publish({ instanceId, displayName, phase: { status: "starting" } });
  return new Promise<void>((resolve) => {
    cancelSession = resolve;
  });
}

/** Mark a code as in flight so the dialog can disable its input. */
export function markClaudeLoginCodeSubmitting(): void {
  if (state.phase.status !== "authorizing") return;
  publish({ ...state, phase: { ...state.phase, submitting: true, rejection: null } });
}

/** Record a local failure to deliver the code (transport, not the CLI). */
export function reportClaudeLoginSubmitFailure(message: string): void {
  if (state.phase.status !== "authorizing") return;
  publish({ ...state, phase: { ...state.phase, submitting: false, rejection: message } });
}

/** Close the dialog, interrupting the stream and the server-side CLI with it. */
export function closeClaudeLoginSession(): void {
  cancelSession?.();
  cancelSession = null;
  publish(IDLE);
}

export function resetClaudeLoginSessionForTests(): void {
  cancelSession?.();
  cancelSession = null;
  publish(IDLE);
  listeners.clear();
}
