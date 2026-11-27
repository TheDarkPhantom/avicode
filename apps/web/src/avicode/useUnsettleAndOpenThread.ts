import { scopedThreadKey } from "@t3tools/client-runtime/environment";
import type { ScopedThreadRef } from "@t3tools/contracts";
import { thrownErrorMessage } from "@t3tools/client-runtime/errors";
import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import * as ThreadUndo from "@t3tools/client-runtime/state/thread-undo";
import { useNavigate } from "@tanstack/react-router";
import { msg } from "gt-react";

import { stackedThreadToast, toastManager } from "../components/ui/toast";
import { m } from "../i18n/messages";
import { threadEnvironment } from "../state/threads";
import { useOrchestrationCommand } from "../state/use-orchestration-command";
import { buildThreadRouteParams } from "../threadRoutes";

/** Un-settles a thread and opens it, toasting a failure. Resolves to whether it reopened. */
export function useUnsettleAndOpenThread() {
  const navigate = useNavigate();
  const unsettle = useOrchestrationCommand(threadEnvironment.unsettle, { reportFailure: false });
  return async (ref: ScopedThreadRef): Promise<boolean> => {
    ThreadUndo.invalidate("settle", scopedThreadKey(ref));
    const result = await unsettle({
      environmentId: ref.environmentId,
      input: { threadId: ref.threadId, reason: "user" },
    });
    if (result._tag === "Success") {
      await navigate({ to: "/$environmentId/$threadId", params: buildThreadRouteParams(ref) });
      return true;
    }
    if (!isAtomCommandInterrupted(result)) {
      toastManager.add(
        stackedThreadToast({
          type: "error",
          title: m(msg("Failed to un-settle thread")),
          description:
            thrownErrorMessage(squashAtomCommandFailure(result), m) ?? m(msg("An error occurred.")),
        }),
      );
    }
    return false;
  };
}
