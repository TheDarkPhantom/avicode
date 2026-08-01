import { describe, expect, it } from "vite-plus/test";

import {
  computeRmsLevel,
  createLevelWindow,
  LEVEL_WINDOW,
  pushLevel,
  resolveSignalState,
  SILENCE_GRACE_MS,
  SILENCE_LEVEL,
} from "./audioLevel";

/** `getByteTimeDomainData` centres silence on 128; amplitude is the swing from there. */
function toneSamples(amplitude: number, length = 512): Uint8Array {
  return Uint8Array.from({ length }, (_, index) =>
    Math.round(128 + Math.sin((index / length) * Math.PI * 8) * amplitude * 127),
  );
}

describe("computeRmsLevel", () => {
  it("reports nothing for digital silence", () => {
    expect(computeRmsLevel(new Uint8Array(512).fill(128))).toBe(0);
  });

  it("reports nothing for an empty buffer", () => {
    expect(computeRmsLevel(new Uint8Array(0))).toBe(0);
  });

  it("puts a quiet room below the silence threshold", () => {
    // Microphone self-noise must not read as speech, or the meter would claim
    // to hear a muted input and the whole feature would be a lie.
    expect(computeRmsLevel(toneSamples(0.002))).toBeLessThan(SILENCE_LEVEL);
  });

  it("puts speech-level input above the silence threshold", () => {
    expect(computeRmsLevel(toneSamples(0.2))).toBeGreaterThan(SILENCE_LEVEL);
  });

  it("rises with amplitude and never exceeds one", () => {
    const quiet = computeRmsLevel(toneSamples(0.1));
    const loud = computeRmsLevel(toneSamples(0.6));
    expect(loud).toBeGreaterThan(quiet);
    expect(computeRmsLevel(toneSamples(1))).toBeLessThanOrEqual(1);
  });
});

describe("pushLevel", () => {
  it("holds the window at a fixed width so the bars never reflow", () => {
    let window = createLevelWindow();
    expect(window).toHaveLength(LEVEL_WINDOW);
    for (let i = 0; i < LEVEL_WINDOW * 2; i += 1) {
      window = pushLevel(window, i / 100);
      expect(window).toHaveLength(LEVEL_WINDOW);
    }
  });

  it("keeps the newest sample last", () => {
    const window = pushLevel(createLevelWindow(), 0.42);
    expect(window[window.length - 1]).toBe(0.42);
  });
});

describe("resolveSignalState", () => {
  it("waits rather than accusing the microphone during the opening pause", () => {
    // Pressing the button and thinking for a second is normal; warning then
    // would train the user to ignore the warning.
    expect(resolveSignalState({ elapsedMs: 500, lastSignalAtMs: null })).toBe("waiting");
  });

  it("reports silence once the grace period passes with nothing heard", () => {
    expect(resolveSignalState({ elapsedMs: SILENCE_GRACE_MS + 1, lastSignalAtMs: null })).toBe(
      "silent",
    );
  });

  it("reports hearing while sound is recent", () => {
    expect(resolveSignalState({ elapsedMs: 5_000, lastSignalAtMs: 4_900 })).toBe("hearing");
  });

  it("never returns to waiting once sound has been heard", () => {
    // A pause between sentences is silence. Having heard the microphone work,
    // the honest report is that it has gone quiet, not that it is unproven.
    expect(resolveSignalState({ elapsedMs: 20_000, lastSignalAtMs: 19_000 })).toBe("hearing");
    expect(resolveSignalState({ elapsedMs: 20_000, lastSignalAtMs: 1_000 })).toBe("silent");
  });

  it("honours a caller-supplied grace period", () => {
    expect(resolveSignalState({ elapsedMs: 200, lastSignalAtMs: null, graceMs: 100 })).toBe(
      "silent",
    );
  });
});
