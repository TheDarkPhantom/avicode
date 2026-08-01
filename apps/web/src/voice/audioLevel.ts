/**
 * Avi Code addition: the arithmetic behind the dictation level meter.
 *
 * Dictation's worst failure is the silent one. Every visible signal (the button
 * lights, the socket opens, Deepgram answers) says the session is healthy even
 * when the microphone is muted, the wrong input device is selected, or the OS
 * is routing capture somewhere else. Deepgram dutifully transcribes the silence
 * as nothing, so the composer stays empty and there is no error to report.
 *
 * Pure so the thresholds can be tested without a Web Audio graph, which jsdom
 * does not provide.
 */

/** Levels below this count as silence. Well under speech, above mic self-noise. */
export const SILENCE_LEVEL = 0.015;

/**
 * How long the input may stay silent before the meter says so. Long enough to
 * cover the pause between pressing the button and starting to speak, short
 * enough that a dead microphone is obvious before a whole sentence is lost.
 */
export const SILENCE_GRACE_MS = 2_500;

/** Bars in the meter. Each holds one sample, newest on the right. */
export const LEVEL_WINDOW = 5;

/**
 * Root mean square of a byte time-domain buffer, normalized to roughly 0..1.
 *
 * `getByteTimeDomainData` centres silence on 128, so each sample is offset from
 * there. RMS rather than peak: peak jumps on a single click of desk noise,
 * which would make the meter twitch when nothing was said.
 *
 * The x4 gain maps conversational speech onto most of the bar's travel. Without
 * it normal speech sits near the bottom and the meter reads as broken.
 */
export function computeRmsLevel(samples: Uint8Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (const sample of samples) {
    const centred = (sample - 128) / 128;
    sumSquares += centred * centred;
  }
  return Math.min(1, Math.sqrt(sumSquares / samples.length) * 4);
}

/** Append a sample, keeping the window at a fixed width so bars never reflow. */
export function pushLevel(window: readonly number[], level: number): number[] {
  const next = [...window, level];
  return next.length > LEVEL_WINDOW ? next.slice(next.length - LEVEL_WINDOW) : next;
}

export function createLevelWindow(): number[] {
  return Array.from({ length: LEVEL_WINDOW }, () => 0);
}

export type DictationSignalState = "waiting" | "hearing" | "silent";

/**
 * What the meter should say, given how long the session has run and when sound
 * was last heard.
 *
 * `waiting` covers the grace period, so pressing the button and pausing to
 * think does not accuse the microphone of being broken. Once sound has been
 * heard the meter never returns to `waiting`: a natural pause between sentences
 * is silence, and warning about it every time would be noise.
 */
export function resolveSignalState(input: {
  readonly elapsedMs: number;
  readonly lastSignalAtMs: number | null;
  readonly graceMs?: number;
}): DictationSignalState {
  const graceMs = input.graceMs ?? SILENCE_GRACE_MS;
  if (input.lastSignalAtMs !== null) {
    return input.elapsedMs - input.lastSignalAtMs > graceMs ? "silent" : "hearing";
  }
  return input.elapsedMs > graceMs ? "silent" : "waiting";
}
