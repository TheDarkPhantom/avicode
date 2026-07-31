import * as Effect from "effect/Effect";
import {
  VoiceNotConfiguredError,
  type VoiceCredentialError,
  type VoiceCredentialResult,
} from "@t3tools/contracts";

/**
 * Hands the client the Deepgram key it opens the transcription socket with.
 *
 * `apiKey` must be the *materialized* plaintext (see materializeSecrets in
 * serverSettings.ts) — the redacted copy that goes to clients is always "".
 *
 * There is no Deepgram round trip here. The fork used to exchange this key for
 * a short-lived JWT, which only works for keys with Member permissions and
 * silently killed dictation for every weaker key. See packages/contracts/src/voice.ts.
 */
export const getVoiceCredential = (
  apiKey: string,
): Effect.Effect<VoiceCredentialResult, VoiceCredentialError> =>
  apiKey.length === 0 ? Effect.fail(new VoiceNotConfiguredError()) : Effect.succeed({ apiKey });
