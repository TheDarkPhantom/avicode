import { useCallback } from "react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { serverEnvironment } from "~/state/server";

import { usePrimaryEnvironment } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Requests a short-lived Deepgram token from the server. The account API key
 * stays server-side; see packages/contracts/src/voice.ts for why.
 */
export function useVoiceToken(): () => Promise<{ accessToken: string }> {
  const environmentId = usePrimaryEnvironment()?.environmentId ?? null;
  const createToken = useAtomCommand(serverEnvironment.createVoiceToken, {
    label: "voice token",
    // The dictation UI surfaces its own inline error, so the generic failure
    // toast would double up.
    reportFailure: false,
  });

  return useCallback(async () => {
    if (!environmentId) {
      throw new Error("Not connected to a server.");
    }
    const result = await createToken({ environmentId, input: {} });
    if (result._tag !== "Success") {
      // `result.cause` is an Effect Cause, not the failure itself, so reading
      // `.message` off it always missed and every rejection came out as the
      // generic fallback. Squashing first gets the decoded VoiceTokenError,
      // whose message names what to fix.
      const error = squashAtomCommandFailure(result);
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not start dictation.";
      throw new Error(message);
    }
    return { accessToken: result.value.accessToken };
  }, [createToken, environmentId]);
}
