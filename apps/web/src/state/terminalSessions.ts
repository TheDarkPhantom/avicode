import {
  combineTerminalSessionState,
  EMPTY_TERMINAL_BUFFER_STATE,
  EMPTY_TERMINAL_SESSION_STATE,
  selectRunningSubprocessTerminalIds,
  type KnownTerminalSession,
  type TerminalSessionState,
} from "@t3tools/client-runtime/state/terminal";
import { useAtomValue } from "@effect/atom-react";
import {
  EnvironmentId,
  ThreadId,
  type TerminalAttachInput,
  type TerminalSummary,
} from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { useMemo } from "react";

import { useEnvironmentQuery } from "./query";
import { terminalEnvironment } from "./terminal";

export function useAttachedTerminalSession(input: {
  readonly environmentId: EnvironmentId | null;
  readonly terminal: TerminalAttachInput | null;
}): TerminalSessionState {
  const attach = useEnvironmentQuery(
    input.environmentId !== null && input.terminal !== null
      ? terminalEnvironment.attach({
          environmentId: input.environmentId,
          input: input.terminal,
        })
      : null,
  );
  const metadata = useEnvironmentQuery(
    input.environmentId === null
      ? null
      : terminalEnvironment.metadata({
          environmentId: input.environmentId,
          input: null,
        }),
  );

  return useMemo(() => {
    if (input.environmentId === null || input.terminal === null) {
      return EMPTY_TERMINAL_SESSION_STATE;
    }
    const summary =
      metadata.data?.find(
        (terminal) =>
          terminal.threadId === input.terminal?.threadId &&
          terminal.terminalId === input.terminal?.terminalId,
      ) ?? null;
    const state = combineTerminalSessionState(summary, attach.data ?? EMPTY_TERMINAL_BUFFER_STATE);
    return attach.error === null ? state : { ...state, error: attach.error, status: "error" };
  }, [attach.data, attach.error, input.environmentId, input.terminal, metadata.data]);
}

const EMPTY_KNOWN_TERMINAL_SESSIONS = Object.freeze<ReadonlyArray<KnownTerminalSession>>([]);

const NO_KNOWN_TERMINAL_SESSIONS_ATOM = Atom.make(EMPTY_KNOWN_TERMINAL_SESSIONS).pipe(
  Atom.withLabel("web-known-terminal-sessions:none"),
);

export function selectKnownTerminalSessions(
  metadata: ReadonlyArray<TerminalSummary>,
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
): ReadonlyArray<KnownTerminalSession> {
  const sessions = metadata
    .filter((summary) => threadId === null || summary.threadId === threadId)
    .map((summary) => ({
      target: {
        environmentId,
        threadId: ThreadId.make(summary.threadId),
        terminalId: summary.terminalId,
      },
      state: combineTerminalSessionState(summary, EMPTY_TERMINAL_BUFFER_STATE),
    }))
    .toSorted((left, right) =>
      left.target.terminalId.localeCompare(right.target.terminalId, undefined, {
        numeric: true,
      }),
    );
  return sessions.length === 0 ? EMPTY_KNOWN_TERMINAL_SESSIONS : sessions;
}

// Metadata upserts keep untouched summaries by reference, so two views built
// from the same summaries are the same view.
function sameKnownTerminalSessions(
  left: ReadonlyArray<KnownTerminalSession>,
  right: ReadonlyArray<KnownTerminalSession>,
): boolean {
  return (
    left.length === right.length &&
    left.every((session, index) => session.state.summary === right[index]!.state.summary)
  );
}

const decodeKnownSessionsKey = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Tuple([EnvironmentId, Schema.NullOr(ThreadId)])),
);

// Derived per thread, so a terminal update elsewhere in the environment
// notifies no one here: every sidebar row reads its own thread's sessions.
const knownTerminalSessionsFamily = Atom.family((key: string) => {
  const [environmentId, threadId] = Option.getOrThrow(decodeKnownSessionsKey(key));
  return Atom.make((get) =>
    selectKnownTerminalSessions(
      Option.getOrElse(
        AsyncResult.value(get(terminalEnvironment.metadata({ environmentId, input: null }))),
        () => [],
      ),
      environmentId,
      threadId,
    ),
  ).pipe(
    Atom.withEquality(sameKnownTerminalSessions),
    Atom.withLabel(`web-known-terminal-sessions:${key}`),
  );
});

export function knownTerminalSessionsAtom(
  environmentId: EnvironmentId,
  threadId: ThreadId | null,
): Atom.Atom<ReadonlyArray<KnownTerminalSession>> {
  return knownTerminalSessionsFamily(JSON.stringify([environmentId, threadId]));
}

export function useKnownTerminalSessions(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ReadonlyArray<KnownTerminalSession> {
  return useAtomValue(
    input.environmentId === null
      ? NO_KNOWN_TERMINAL_SESSIONS_ATOM
      : knownTerminalSessionsAtom(input.environmentId, input.threadId),
  );
}

export function useThreadRunningTerminalIds(input: {
  readonly environmentId: EnvironmentId | null;
  readonly threadId: ThreadId | null;
}): ReadonlyArray<string> {
  return selectRunningSubprocessTerminalIds(useKnownTerminalSessions(input));
}
