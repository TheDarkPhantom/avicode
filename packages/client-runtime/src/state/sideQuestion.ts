/**
 * Avi Code addition: client state for `/btw` side questions.
 *
 * One question at a time, per environment+thread. The answer is accumulated in
 * an atom as chunks arrive rather than resolved at the end, because the whole
 * point of asking mid-task is not waiting.
 *
 * Nothing here is persisted. The answer lives until the panel is dismissed or
 * the next question replaces it — matching the server, where the fork the
 * answer came from is discarded the moment it is read.
 *
 * @module sideQuestion
 */
import {
  type EnvironmentId,
  type ProviderSideQuestionInput,
  WS_METHODS,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import { Atom } from "effect/unstable/reactivity";

import type { EnvironmentRegistry } from "../connection/registry.ts";
import { runStream } from "../rpc/client.ts";
import { createRuntimeCommand, runStreamInEnvironment } from "./runtime.ts";

export interface SideQuestionState {
  readonly question: string;
  readonly answer: string;
  /** "idle" is the dismissed/never-asked state; the panel renders nothing. */
  readonly status: "idle" | "asking" | "answered" | "failed";
  readonly error: string | null;
}

export const EMPTY_SIDE_QUESTION_STATE: SideQuestionState = {
  question: "",
  answer: "",
  status: "idle",
  error: null,
};

export const sideQuestionStateAtom = Atom.family((threadKey: string) =>
  Atom.make(EMPTY_SIDE_QUESTION_STATE).pipe(
    Atom.keepAlive,
    Atom.withLabel(`side-question:${threadKey}`),
  ),
);

export interface AskSideQuestionInput {
  readonly threadKey: string;
  readonly environmentId: EnvironmentId;
  readonly threadId: ProviderSideQuestionInput["threadId"];
  readonly question: string;
}

export function createSideQuestionCommand<R, ER>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, ER>,
) {
  return createRuntimeCommand<EnvironmentRegistry | R, ER, AskSideQuestionInput, void, unknown>(
    runtime,
    {
      label: "side-question:ask",
      // One in flight per thread: a second `/btw` replaces the first rather
      // than interleaving two answers into the same panel.
      concurrency: { mode: "latest", key: (input) => input.threadKey },
      execute: (input, registry) => {
        const stateAtom = sideQuestionStateAtom(input.threadKey);
        registry.set(stateAtom, {
          question: input.question,
          answer: "",
          status: "asking",
          error: null,
        });
        return runStreamInEnvironment(
          input.environmentId,
          runStream(WS_METHODS.providerAskSideQuestion, {
            threadId: input.threadId,
            question: input.question,
          }),
        ).pipe(
          Stream.runForEach((chunk) =>
            Effect.sync(() => {
              const current = registry.get(stateAtom);
              // A dismissal (which resets to idle) or a newer question must not
              // be overwritten by chunks still arriving from the old one.
              if (current.status !== "asking" || current.question !== input.question) return;
              registry.set(stateAtom, {
                ...current,
                answer: current.answer + chunk.textDelta,
                status: "asking",
              });
            }),
          ),
          Effect.tap(() =>
            Effect.sync(() => {
              const current = registry.get(stateAtom);
              if (current.status !== "asking" || current.question !== input.question) return;
              registry.set(stateAtom, { ...current, status: "answered" });
            }),
          ),
          Effect.tapError((cause) =>
            Effect.sync(() => {
              const current = registry.get(stateAtom);
              if (current.status !== "asking" || current.question !== input.question) return;
              registry.set(stateAtom, {
                ...current,
                status: "failed",
                error:
                  cause instanceof Error && cause.message.length > 0
                    ? cause.message
                    : "Could not answer the side question.",
              });
            }),
          ),
          Effect.asVoid,
        );
      },
    },
  );
}
