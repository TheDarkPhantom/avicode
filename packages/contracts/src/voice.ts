import * as Schema from "effect/Schema";
import { TrimmedNonEmptyString } from "./baseSchemas.ts";

/**
 * Voice dictation transcribes through Deepgram's streaming API directly from
 * the client, so the socket has to be opened with a credential the browser can
 * hold. The account API key must never be that credential — `apps/web` is also
 * served over the tailnet `--share` URL, where anything shipped to the page is
 * readable by every device that can reach it.
 *
 * Instead the server exchanges the stored key for a short-lived Deepgram access
 * token (`POST /v1/auth/grant`) and hands only that to the client. The token
 * needs to be valid at connect time; the socket then stays open for the whole
 * recording regardless of expiry, so a short TTL costs nothing.
 *
 * The token is a JWT and is passed with the `bearer` WebSocket subprotocol
 * (`["bearer", token]`), which is what Deepgram's own JS SDK sends from a
 * browser. The streaming endpoint does not accept an `access_token` query
 * parameter at all. See buildDeepgramSocketProtocols in apps/web.
 *
 * The grant call needs an API key with at least Member permissions. A key
 * below that transcribes fine but gets 403 from `/v1/auth/grant`, so the
 * failure looks like "dictation does nothing" rather than "wrong key".
 */
export const VOICE_TOKEN_TTL_SECONDS = 60;

export const VoiceTokenResult = Schema.Struct({
  accessToken: TrimmedNonEmptyString,
  /** Seconds until the token stops being accepted for *new* connections. */
  expiresIn: Schema.Number,
});
export type VoiceTokenResult = typeof VoiceTokenResult.Type;

export class VoiceNotConfiguredError extends Schema.TaggedErrorClass<VoiceNotConfiguredError>()(
  "VoiceNotConfiguredError",
  {},
) {
  override get message(): string {
    return "No Deepgram API key is configured. Add one in Settings → Avi Code → Voice.";
  }
}

export class VoiceTokenRejectedError extends Schema.TaggedErrorClass<VoiceTokenRejectedError>()(
  "VoiceTokenRejectedError",
  {
    status: Schema.Number,
  },
) {
  override get message(): string {
    // 403 is the one worth spelling out: the key works for transcription, so
    // "check your key" sends you looking in the wrong place. Deepgram only
    // issues dictation tokens to keys with Member permissions or higher.
    if (this.status === 403) {
      return "This Deepgram key is not allowed to create dictation tokens. Create a key with at least Member permissions at console.deepgram.com, then paste it into Settings → Avi Code → Voice.";
    }
    if (this.status === 401) {
      return "Deepgram rejected the configured API key. Check it in Settings → Avi Code → Voice.";
    }
    return `Deepgram refused to issue a dictation token (HTTP ${this.status}).`;
  }
}

export class VoiceTokenRequestError extends Schema.TaggedErrorClass<VoiceTokenRequestError>()(
  "VoiceTokenRequestError",
  {
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return "Could not reach Deepgram to start dictation.";
  }
}

export const VoiceTokenError = Schema.Union([
  VoiceNotConfiguredError,
  VoiceTokenRejectedError,
  VoiceTokenRequestError,
]);
export type VoiceTokenError = typeof VoiceTokenError.Type;

export const isVoiceTokenError = Schema.is(VoiceTokenError);
