import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { HttpClient, HttpClientRequest, HttpClientResponse } from "effect/unstable/http";
import {
  VOICE_TOKEN_TTL_SECONDS,
  VoiceNotConfiguredError,
  VoiceTokenRejectedError,
  VoiceTokenRequestError,
  type VoiceTokenError,
  type VoiceTokenResult,
} from "@t3tools/contracts";

const DEEPGRAM_GRANT_URL = "https://api.deepgram.com/v1/auth/grant";

/**
 * Deepgram returns `expires_in` in seconds alongside the JWT. We only forward
 * the two fields the client needs; the response carries more.
 */
const DeepgramGrantResponse = Schema.Struct({
  access_token: Schema.String,
  expires_in: Schema.Number,
});

/**
 * Exchanges the stored Deepgram API key for a short-lived access token that is
 * safe to hand to the browser.
 *
 * `apiKey` must be the *materialized* plaintext (see materializeSecrets in
 * serverSettings.ts) — the redacted copy that goes to clients is always "".
 */
export const createVoiceToken = (
  apiKey: string,
): Effect.Effect<VoiceTokenResult, VoiceTokenError, HttpClient.HttpClient> =>
  Effect.gen(function* () {
    if (apiKey.length === 0) {
      return yield* new VoiceNotConfiguredError();
    }

    const httpClient = yield* HttpClient.HttpClient;

    const request = HttpClientRequest.post(DEEPGRAM_GRANT_URL).pipe(
      HttpClientRequest.setHeader("Authorization", `Token ${apiKey}`),
      HttpClientRequest.acceptJson,
      HttpClientRequest.bodyJsonUnsafe({ ttl_seconds: VOICE_TOKEN_TTL_SECONDS }),
    );

    const response = yield* httpClient
      .execute(request)
      .pipe(Effect.mapError((cause) => new VoiceTokenRequestError({ cause })));

    return yield* HttpClientResponse.matchStatus({
      "2xx": (success) =>
        HttpClientResponse.schemaBodyJson(DeepgramGrantResponse)(success).pipe(
          Effect.map(
            (grant): VoiceTokenResult => ({
              accessToken: grant.access_token,
              expiresIn: grant.expires_in,
            }),
          ),
          Effect.mapError((cause) => new VoiceTokenRequestError({ cause })),
        ),
      orElse: (failed) => Effect.fail(new VoiceTokenRejectedError({ status: failed.status })),
    })(response);
  });
