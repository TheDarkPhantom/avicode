import { useCallback } from "react";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { serverEnvironment } from "~/state/server";

import { usePrimaryEnvironment } from "~/state/environments";
import { useAtomCommand } from "~/state/use-atom-command";

/**
 * Fetches the Deepgram API key the dictation socket authenticates with. The key
 * is stored server-side and released to the client only for this;
 * see packages/contracts/src/voice.ts for the trade that implies.
 */
export function useVoiceCredential(): () => Promise<{ apiKey: string }> {
  const environmentId = usePrimaryEnvironment()?.environmentId ?? null;
  const getCredential = useAtomCommand(serverEnvironment.getVoiceCredential, {
    label: "voice credential",
    // The dictation UI surfaces its own inline error, so the generic failure
    // toast would double up.
    reportFailure: false,
  });

  return useCallback(async () => {
    if (!environmentId) {
      throw new Error("Not connected to a server.");
    }
    const result = await getCredential({ environmentId, input: {} });
    if (result._tag !== "Success") {
      // `result.cause` is an Effect Cause, not the failure itself, so reading
      // `.message` off it always missed and every rejection came out as the
      // generic fallback. Squashing first gets the decoded VoiceCredentialError,
      // whose message names what to fix.
      const error = squashAtomCommandFailure(result);
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Could not start dictation.";
      throw new Error(message);
    }
    return { apiKey: result.value.apiKey };
  }, [getCredential, environmentId]);
}
