import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Voice dictation transcribes through Deepgram's streaming API directly from
 * the client, so the socket has to be opened with a credential the browser can
 * hold. That credential is the stored account API key, sent with Deepgram's
 * `token` WebSocket subprotocol (`["token", apiKey]`) exactly as VibeSpeak does
 * in `renderer/overlay.js`.
 *
 * The fork briefly exchanged the key for a short-lived JWT via
 * `POST /v1/auth/grant` instead. That endpoint only answers keys with Member
 * permissions or higher, and a weaker key transcribes perfectly well, so the
 * exchange turned working keys into dead dictation. Avi Code is distributed as
 * a desktop installer where each install holds its own locally entered key, so
 * the key never travels further than the renderer on the same machine.
 *
 * The one case that does expose it is a `--share` pairing URL, which points a
 * remote browser at this server and therefore hands that browser the key. That
 * is a deliberate trade: any Deepgram key works, at the cost of the key being
 * readable by whoever you share a session with.
 */

export const VoiceCredentialResult = Schema.Struct({
  /** Deepgram account API key, used directly as the socket subprotocol value. */
  apiKey: TrimmedNonEmptyString,
});
export type VoiceCredentialResult = typeof VoiceCredentialResult.Type;

export class VoiceNotConfiguredError extends Schema.TaggedErrorClass<VoiceNotConfiguredError>()(
  "VoiceNotConfiguredError",
  {},
) {
  override get message(): string {
    return "No Deepgram API key is configured. Add one in Settings → Avi Code → Voice.";
  }
}

export class VoiceCredentialUnavailableError extends Schema.TaggedErrorClass<VoiceCredentialUnavailableError>()(
  "VoiceCredentialUnavailableError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Could not read the stored Deepgram API key.";
  }
}

export const VoiceCredentialError = Schema.Union([
  VoiceNotConfiguredError,
  VoiceCredentialUnavailableError,
]);
export type VoiceCredentialError = typeof VoiceCredentialError.Type;

export const isVoiceCredentialError = Schema.is(VoiceCredentialError);
