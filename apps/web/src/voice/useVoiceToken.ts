import { useCallback } from "react";
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
      const cause = result.cause;
      const message =
        cause && typeof cause === "object" && "message" in cause
          ? String((cause as { message: unknown }).message)
          : "Could not start dictation.";
      throw new Error(message);
    }
    return { accessToken: result.value.accessToken };
  }, [createToken, environmentId]);
}
