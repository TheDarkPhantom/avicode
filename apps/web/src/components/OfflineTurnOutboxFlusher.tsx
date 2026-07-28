import type { ClientOrchestrationCommand, CommandId, EnvironmentId } from "@t3tools/contracts";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { useEffect, useRef } from "react";

import { type QueuedTurnOutboxItem, useOfflineTurnOutboxStore } from "../offlineTurnOutboxStore";
import { useEnvironments } from "../state/environments";
import { threadEnvironment } from "../state/threads";
import { useAtomCommand } from "../state/use-atom-command";
import { stackedThreadToast, toastManager } from "./ui/toast";

export async function dispatchQueuedTurnCommands(
  item: QueuedTurnOutboxItem,
  dispatchCommand: (
    environmentId: EnvironmentId,
    command: ClientOrchestrationCommand,
  ) => Promise<AtomCommandResult<unknown, unknown>>,
): Promise<Extract<AtomCommandResult<unknown, unknown>, { readonly _tag: "Failure" }> | null> {
  for (const command of item.commands) {
    const result = await dispatchCommand(item.environmentId, command);
    if (result._tag === "Failure") return result;
  }
  return null;
}

export function OfflineTurnOutboxFlusher() {
  const { environments } = useEnvironments();
  const items = useOfflineTurnOutboxStore((state) => state.items);
  const updateMetadata = useAtomCommand(threadEnvironment.updateMetadata, { reportFailure: false });
  const setRuntimeMode = useAtomCommand(threadEnvironment.setRuntimeMode, { reportFailure: false });
  const setInteractionMode = useAtomCommand(threadEnvironment.setInteractionMode, {
    reportFailure: false,
  });
  const startTurn = useAtomCommand(threadEnvironment.startTurn, { reportFailure: false });
  const cyclesRef = useRef(new Map<EnvironmentId, number>());
  const previouslyConnectedRef = useRef(new Set<EnvironmentId>());
  const attemptedRef = useRef(new Set<string>());
  const inFlightRef = useRef(new Set<CommandId>());

  useEffect(() => {
    const connected = new Set(
      environments
        .filter((environment) => environment.connection.phase === "connected")
        .map((environment) => environment.environmentId),
    );
    for (const environmentId of connected) {
      if (!previouslyConnectedRef.current.has(environmentId)) {
        cyclesRef.current.set(environmentId, (cyclesRef.current.get(environmentId) ?? 0) + 1);
      }
    }
    previouslyConnectedRef.current = connected;

    const dispatchCommand = async (
      environmentId: EnvironmentId,
      command: ClientOrchestrationCommand,
    ): Promise<AtomCommandResult<unknown, unknown>> => {
      switch (command.type) {
        case "thread.meta.update": {
          const { type: _, ...input } = command;
          return updateMetadata({ environmentId, input });
        }
        case "thread.runtime-mode.set": {
          const { type: _, ...input } = command;
          return setRuntimeMode({ environmentId, input });
        }
        case "thread.interaction-mode.set": {
          const { type: _, ...input } = command;
          return setInteractionMode({ environmentId, input });
        }
        case "thread.turn.start": {
          const { type: _, ...input } = command;
          return startTurn({ environmentId, input });
        }
        default:
          throw new Error(`Unsupported queued command: ${command.type}`);
      }
    };

    const flush = async (item: QueuedTurnOutboxItem) => {
      inFlightRef.current.add(item.id);
      useOfflineTurnOutboxStore.getState().setFailure(item.id, null);
      try {
        const failure = await dispatchQueuedTurnCommands(item, dispatchCommand);
        if (failure) {
          if (!isAtomCommandInterrupted(failure)) {
            const error = squashAtomCommandFailure(failure);
            const message =
              error instanceof Error ? error.message : "Failed to send queued message.";
            useOfflineTurnOutboxStore.getState().setFailure(item.id, message);
            toastManager.add(
              stackedThreadToast({
                type: "error",
                title: "Queued message could not be sent",
                description: message,
              }),
            );
          }
          return;
        }
        useOfflineTurnOutboxStore.getState().remove(item.id);
        toastManager.add({
          type: "success",
          title: "Queued message sent",
          description: "The environment reconnected and the message was delivered.",
        });
      } finally {
        inFlightRef.current.delete(item.id);
      }
    };

    for (const item of items) {
      if (!connected.has(item.environmentId) || inFlightRef.current.has(item.id)) continue;
      const attemptKey = `${item.id}:${cyclesRef.current.get(item.environmentId) ?? 0}`;
      if (attemptedRef.current.has(attemptKey)) continue;
      attemptedRef.current.add(attemptKey);
      void flush(item);
    }
  }, [environments, items, setInteractionMode, setRuntimeMode, startTurn, updateMetadata]);

  return null;
}
