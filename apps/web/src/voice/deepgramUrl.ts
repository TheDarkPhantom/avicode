/**
 * Deepgram streaming URL builder.
 *
 * Streaming does not support language detection, so "auto" maps to
 * multilingual code-switching (`language=multi`). Smart Format already
 * implies punctuation, so `punctuate` is only sent when Smart Format is off.
 */

export interface DeepgramUrlOptions {
  readonly language?: string;
  readonly smartFormat?: boolean;
  readonly punctuate?: boolean;
  readonly fillerWords?: boolean;
}

export const DEEPGRAM_LISTEN_URL = "wss://api.deepgram.com/v1/listen";

export function buildDeepgramSocketProtocols(accessToken: string): [string, string] {
  return ["bearer", accessToken];
}

export function buildDeepgramSocketUrl(options: DeepgramUrlOptions): string {
  const { language = "auto", smartFormat = true, punctuate = true, fillerWords = false } = options;

  const params = new URLSearchParams();
  params.set("model", "nova-2");
  params.set("language", language === "auto" ? "multi" : language || "en");
  params.set("smart_format", smartFormat ? "true" : "false");
  if (!smartFormat) {
    params.set("punctuate", punctuate ? "true" : "false");
  }
  params.set("interim_results", "true");
  params.set("filler_words", fillerWords ? "true" : "false");

  return `${DEEPGRAM_LISTEN_URL}?${params.toString()}`;
}
