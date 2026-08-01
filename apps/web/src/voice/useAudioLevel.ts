import { useEffect, useRef, useState } from "react";

import {
  computeRmsLevel,
  createLevelWindow,
  pushLevel,
  resolveSignalState,
  SILENCE_LEVEL,
  type DictationSignalState,
} from "./audioLevel.ts";

/**
 * Avi Code addition: live microphone level for the dictation meter.
 *
 * Sampled on an interval rather than `requestAnimationFrame`. A rAF loop
 * repaints every frame for as long as dictation runs, which is exactly the
 * pattern AGENTS.md calls out for pegging the GPU on high-refresh displays.
 * Fifteen samples a second reads as continuous to the eye and costs almost
 * nothing.
 */
const SAMPLE_INTERVAL_MS = 66;

/** Small FFT: this needs a loudness number, not a spectrum. */
const ANALYSER_FFT_SIZE = 512;

export interface AudioLevelState {
  /** Most recent samples, oldest first, each roughly 0..1. */
  readonly levels: readonly number[];
  readonly signal: DictationSignalState;
}

const IDLE_STATE: AudioLevelState = { levels: createLevelWindow(), signal: "waiting" };

/**
 * Watches a live capture stream and reports its loudness.
 *
 * Passing null (dictation not running) tears the audio graph down and resets,
 * so the meter never shows a stale reading from the previous session.
 */
export function useAudioLevel(stream: MediaStream | null): AudioLevelState {
  const [state, setState] = useState<AudioLevelState>(IDLE_STATE);
  // Held in a ref so the sampling interval never re-subscribes mid-session.
  const stateRef = useRef<AudioLevelState>(IDLE_STATE);

  useEffect(() => {
    if (!stream) {
      stateRef.current = IDLE_STATE;
      setState(IDLE_STATE);
      return;
    }

    const AudioContextCtor =
      typeof window === "undefined"
        ? undefined
        : (window.AudioContext ??
          (window as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AudioContextCtor) return;

    let context: AudioContext;
    try {
      context = new AudioContextCtor();
    } catch {
      // No audio graph means no meter. Dictation itself is unaffected, so this
      // stays silent rather than reporting a failure the user cannot act on.
      return;
    }

    const analyser = context.createAnalyser();
    analyser.fftSize = ANALYSER_FFT_SIZE;
    const source = context.createMediaStreamSource(stream);
    source.connect(analyser);
    // Deliberately not connected to `context.destination`: routing the
    // microphone to the speakers would feed back.

    const samples = new Uint8Array(analyser.fftSize);
    const startedAtMs = performance.now();
    let lastSignalAtMs: number | null = null;
    let levels = createLevelWindow();

    const timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(samples);
      const level = computeRmsLevel(samples);
      const elapsedMs = performance.now() - startedAtMs;
      if (level >= SILENCE_LEVEL) lastSignalAtMs = elapsedMs;
      levels = pushLevel(levels, level);
      const next: AudioLevelState = {
        levels,
        signal: resolveSignalState({ elapsedMs, lastSignalAtMs }),
      };
      stateRef.current = next;
      setState(next);
    }, SAMPLE_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
      source.disconnect();
      analyser.disconnect();
      void context.close().catch(() => {
        // Closing races an already-closing context on fast stop/start; there is
        // nothing to recover and the context is discarded either way.
      });
      stateRef.current = IDLE_STATE;
      setState(IDLE_STATE);
    };
  }, [stream]);

  return state;
}
