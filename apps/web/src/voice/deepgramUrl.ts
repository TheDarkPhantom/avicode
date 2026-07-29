/**
 * Deepgram streaming URL builder, ported from VibeSpeak's
 * `renderer/deepgram-url.js`. Two non-obvious constraints are baked in and
 * should stay that way:
 *
 * - Streaming does NOT support language detection, so "auto" maps to
 *   multilingual code-switching (`language=multi`).
 *   https://developers.deepgram.com/docs/multilingual-code-switching
 * - Smart Format already implies punctuation, so `punctuate` is only sent
 *   when Smart Format is off — otherwise it is redundant and misleading.
 *   https://developers.deepgram.com/docs/smart-format
 */

export interface DeepgramUrlOptions {
  /** Short-lived token from `voice.createToken`. See the note below. */
  readonly accessToken: string;
  readonly language?: string;
  readonly smartFormat?: boolean;
  readonly punctuate?: boolean;
  readonly fillerWords?: boolean;
}

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

export function buildDeepgramSocketUrl(options: DeepgramUrlOptions): string {
  const {
    accessToken,
    language = "auto",
    smartFormat = true,
    punctuate = true,
    fillerWords = false,
  } = options;

  const params = new URLSearchParams();
  params.set("model", "nova-2");
  params.set("language", language === "auto" ? "multi" : language || "en");
  params.set("smart_format", smartFormat ? "true" : "false");
  if (!smartFormat) {
    params.set("punctuate", punctuate ? "true" : "false");
  }
  params.set("interim_results", "true");
  params.set("filler_words", fillerWords ? "true" : "false");

  // The token goes in the query string, not the `Sec-WebSocket-Protocol`
  // subprotocol. VibeSpeak uses `new WebSocket(url, ["token", apiKey])`, which
  // only works because raw API keys are short — Deepgram's temporary tokens are
  // JWTs and overflow that header, failing the handshake with a 401.
  // https://github.com/orgs/deepgram/discussions/1470
  params.set("access_token", accessToken);

  return `${DEEPGRAM_LISTEN_URL}?${params.toString()}`;
}
