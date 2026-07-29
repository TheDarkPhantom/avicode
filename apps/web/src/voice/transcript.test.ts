import { describe, expect, it } from "vite-plus/test";
import {
  applyDeepgramResult,
  emptyTranscript,
  parseDeepgramMessage,
  renderTranscript,
  type TranscriptState,
} from "./transcript";

const results = (state: TranscriptState, ...items: Array<[string, boolean]>) =>
  items.reduce(
    (acc, [transcript, isFinal]) => applyDeepgramResult(acc, { transcript, isFinal }),
    state,
  );

const message = (transcript: string, isFinal: boolean) => ({
  type: "Results",
  is_final: isFinal,
  channel: { alternatives: [{ transcript }] },
});

describe("parseDeepgramMessage", () => {
  it("reads the first alternative and the final flag", () => {
    expect(parseDeepgramMessage(message("hello there", true))).toEqual({
      transcript: "hello there",
      isFinal: true,
    });
  });

  it("treats a missing is_final as interim", () => {
    expect(parseDeepgramMessage({ ...message("hi", false), is_final: undefined })).toEqual({
      transcript: "hi",
      isFinal: false,
    });
  });

  it("ignores empty transcripts emitted during silence", () => {
    expect(parseDeepgramMessage(message("", true))).toBeNull();
  });

  it("ignores non-Results messages such as Metadata and UtteranceEnd", () => {
    expect(parseDeepgramMessage({ type: "Metadata", request_id: "x" })).toBeNull();
    expect(parseDeepgramMessage({ type: "UtteranceEnd", last_word_end: 1 })).toBeNull();
  });

  it("ignores malformed payloads", () => {
    expect(parseDeepgramMessage(null)).toBeNull();
    expect(parseDeepgramMessage("nonsense")).toBeNull();
    expect(parseDeepgramMessage({ type: "Results", channel: { alternatives: [] } })).toBeNull();
  });
});

describe("applyDeepgramResult", () => {
  it("replaces interim text rather than appending it", () => {
    // This is the whole point of the module: Deepgram re-sends a growing guess
    // for the same utterance, so appending would stutter the words.
    const state = results(
      emptyTranscript,
      ["refac", false],
      ["refactor", false],
      ["refactor the", false],
    );
    expect(renderTranscript(state)).toBe("refactor the");
  });

  it("commits final text and clears the interim guess", () => {
    const state = results(emptyTranscript, ["refactor th", false], ["refactor the auth", true]);
    expect(state).toEqual({ finalText: "refactor the auth", interimText: "" });
  });

  it("accumulates successive final utterances", () => {
    const state = results(emptyTranscript, ["first sentence", true], ["second sentence", true]);
    expect(renderTranscript(state)).toBe("first sentence second sentence");
  });

  it("shows committed text plus the live guess together", () => {
    const state = results(emptyTranscript, ["first sentence", true], ["and then", false]);
    expect(renderTranscript(state)).toBe("first sentence and then");
  });

  it("does not put a space before trailing punctuation", () => {
    const state = results(emptyTranscript, ["done", true], [".", true]);
    expect(renderTranscript(state)).toBe("done.");
  });

  it("renders empty for a fresh session", () => {
    expect(renderTranscript(emptyTranscript)).toBe("");
  });

  it("does not leak a stray space when only interim text exists", () => {
    expect(renderTranscript(results(emptyTranscript, ["hello", false]))).toBe("hello");
  });
});
