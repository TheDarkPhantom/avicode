/**
 * Accumulates Deepgram streaming results into the text shown in the composer.
 *
 * Deepgram emits each utterance many times: repeated interim guesses that
 * replace one another, then one `is_final` result that fixes it. So interim
 * text is always *replacement* for the tail, while final text *appends*.
 * Getting this backwards produces stuttering duplicated words, which is why
 * this lives in its own pure module with tests.
 */

export interface TranscriptState {
  /** Utterances Deepgram has committed. Never rewritten. */
  readonly finalText: string;
  /** Current in-flight guess. Replaced by every subsequent result. */
  readonly interimText: string;
}

export const emptyTranscript: TranscriptState = { finalText: "", interimText: "" };

export interface DeepgramResult {
  readonly transcript: string;
  readonly isFinal: boolean;
}

/**
 * Deepgram's socket payloads are `{ channel: { alternatives: [{ transcript }] }, is_final }`.
 * Returns null for the message types we ignore (Metadata, UtteranceEnd, and
 * the empty transcripts emitted during silence).
 */
export function parseDeepgramMessage(raw: unknown): DeepgramResult | null {
  if (typeof raw !== "object" || raw === null) return null;
  const message = raw as {
    type?: unknown;
    is_final?: unknown;
    channel?: { alternatives?: ReadonlyArray<{ transcript?: unknown }> };
  };
  if (message.type !== undefined && message.type !== "Results") return null;

  const transcript = message.channel?.alternatives?.[0]?.transcript;
  if (typeof transcript !== "string" || transcript.length === 0) return null;

  return { transcript, isFinal: message.is_final === true };
}

export function applyDeepgramResult(
  state: TranscriptState,
  result: DeepgramResult,
): TranscriptState {
  if (!result.isFinal) {
    return { ...state, interimText: result.transcript };
  }
  return {
    finalText: joinSpokenSegments(state.finalText, result.transcript),
    interimText: "",
  };
}

/** The text to show right now — committed utterances plus the live guess. */
export function renderTranscript(state: TranscriptState): string {
  return joinSpokenSegments(state.finalText, state.interimText);
}

/**
 * Deepgram sends segments without leading whitespace, so they need joining.
 * Skips the space before clitics and closing punctuation (". ", "'s") which
 * Smart Format can split onto their own segment.
 */
function joinSpokenSegments(left: string, right: string): string {
  if (left.length === 0) return right;
  if (right.length === 0) return left;
  if (/^[\s,.!?;:'’)\]]/.test(right)) return `${left}${right}`;
  return `${left} ${right}`;
}
