import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import {
  AuthOrchestrationOperateScope,
  type ResolvedKeybindingsConfig,
  type ScopedThreadRef,
} from "@t3tools/contracts";
import { msg } from "gt-react";
import { useRef } from "react";

import type { ChatShortcutCommands } from "../components/chat/useChatShortcuts";
import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { useClientSettings } from "../hooks/useSettings";
import { useThreadActions } from "../hooks/useThreadActions";
import { m } from "../i18n/messages";
import type { ShortcutMatchContext } from "../keybindings";
import { readLocalApi } from "../localApi";
import { readThreadShell } from "../state/entities";
import { readEnvironmentScope } from "../state/session";
import { closeThreadSteps } from "./threadCloseReopen";

type ChatShortcutHandler = NonNullable<ChatShortcutCommands["thread.archive"]>;

/**
 * `rightPanel.close`, `thread.settle` and `thread.archive` for the open chat as one handler: a
 * key bound to the close and a thread rule closes the panel tab first and settles or archives
 * the thread when there is none (see `closeThreadSteps`). A close key never un-settles.
 */
export function useThreadArchiveShortcuts(input: {
  /** Null for a local draft, which has nothing to archive. */
  readonly threadRef: ScopedThreadRef | null;
  readonly keybindings: ResolvedKeybindingsConfig;
  readonly getShortcutContext: (target: EventTarget | null) => ShortcutMatchContext;
  readonly closeRightPanel: ChatShortcutHandler;
  /** Settles the open thread, or un-settles it when it is settled. */
  readonly toggleSettled: ChatShortcutHandler;
}): ChatShortcutCommands {
  const { archiveThread } = useThreadActions();
  const confirmThreadArchive = useClientSettings((settings) => settings.confirmThreadArchive);
  const archiving = useRef(false);

  const confirmAndArchive = async (threadRef: ScopedThreadRef, title: string) => {
    if (confirmThreadArchive) {
      const api = readLocalApi();
      if (!api) return;
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm(m(msg('Archive thread "{title}"?', { title }))),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;
    }
    let didArchive = false;
    const result = await archiveThread(threadRef, {
      onArchived: () => {
        didArchive = true;
      },
    });
    if (result._tag !== "Failure" || isAtomCommandInterrupted(result)) return;
    toastManager.add(
      stackedThreadToast({
        type: "error",
        title: didArchive
          ? m(msg("Thread archived, but navigation failed"))
          : m(msg("Failed to archive thread")),
        description:
          thrownErrorMessage(squashAtomCommandFailure(result), m) ?? m(msg("An error occurred.")),
      }),
    );
  };

  const archive: ChatShortcutHandler = ({ event }) => {
    const { threadRef } = input;
    const thread = threadRef ? readThreadShell(threadRef) : null;
    if (!threadRef || !thread) return false;
    if (!readEnvironmentScope(threadRef.environmentId, AuthOrchestrationOperateScope)) return false;
    if (event.repeat || archiving.current) return;
    archiving.current = true;
    void confirmAndArchive(threadRef, thread.title).finally(() => {
      archiving.current = false;
    });
  };

  const closeOrSettle: ChatShortcutHandler = (context) => {
    const steps = closeThreadSteps(
      context.event,
      input.keybindings,
      input.getShortcutContext(context.event.target),
    );
    if (steps.close && input.closeRightPanel(context) !== false) return;
    if (steps.fallback === "archive") return archive(context);
    if (steps.fallback !== "settle") return false;
    const thread = input.threadRef ? readThreadShell(input.threadRef) : null;
    if (steps.close && thread?.settledOverride === "settled") return;
    return input.toggleSettled(context);
  };

  return {
    "rightPanel.close": closeOrSettle,
    "thread.settle": closeOrSettle,
    "thread.archive": closeOrSettle,
  };
}
