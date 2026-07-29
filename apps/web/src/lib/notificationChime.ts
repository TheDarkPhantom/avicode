/**
 * The attention chime: a short rising two-note tone synthesized with the Web
 * Audio API.
 *
 * Synthesized rather than a shipped audio file so there is no asset to load,
 * cache-bust, or license — and so it works on a cold offline start.
 */

/** A5 then E6: a rising interval reads as "look here", not as an error. */
const CHIME_NOTES = [
  { frequencyHz: 880, startSeconds: 0, durationSeconds: 0.14 },
  { frequencyHz: 1_318.51, startSeconds: 0.11, durationSeconds: 0.22 },
] as const;

const PEAK_GAIN = 0.16;
const ATTACK_SECONDS = 0.015;

/**
 * Several threads finishing at once is one event to the person hearing it.
 * The watcher already collapses a batch into a single call; this guards the
 * case where separate websocket frames land a few milliseconds apart.
 */
const MINIMUM_INTERVAL_MS = 1_500;

type AudioContextConstructor = new () => AudioContext;

let sharedContext: AudioContext | null = null;
let lastPlayedAtMs = Number.NEGATIVE_INFINITY;

function resolveAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate =
    window.AudioContext ??
    (window as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  return candidate ?? null;
}

function ensureAudioContext(): AudioContext | null {
  if (sharedContext !== null) return sharedContext;
  const AudioContextCtor = resolveAudioContextConstructor();
  if (AudioContextCtor === null) return null;
  try {
    sharedContext = new AudioContextCtor();
  } catch (error) {
    console.error("Could not open an audio context for notifications.", error);
    return null;
  }
  return sharedContext;
}

/**
 * Open and unblock the audio context from inside a user gesture.
 *
 * Browsers start an AudioContext suspended until the page has been interacted
 * with, and `resume()` only succeeds from a gesture handler. Calling this from
 * the settings toggle means the context is already running by the time a
 * thread finishes — which is never itself a gesture.
 */
export function primeNotificationChime(): void {
  const context = ensureAudioContext();
  if (context === null) return;
  if (context.state === "suspended") {
    void context.resume().catch((error: unknown) => {
      console.error("Could not resume the notification audio context.", error);
    });
  }
}

export function playNotificationChime(): void {
  const context = ensureAudioContext();
  if (context === null) return;

  const nowMs = Date.now();
  if (nowMs - lastPlayedAtMs < MINIMUM_INTERVAL_MS) return;
  lastPlayedAtMs = nowMs;

  if (context.state === "suspended") {
    primeNotificationChime();
  }

  try {
    const startedAt = context.currentTime;
    for (const note of CHIME_NOTES) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.frequencyHz;

      const noteStart = startedAt + note.startSeconds;
      const noteEnd = noteStart + note.durationSeconds;
      // Ramped rather than stepped at both ends: a square-edged gain change
      // is an audible click. Exponential ramps cannot reach zero, hence the
      // small floor before the oscillator stops.
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(PEAK_GAIN, noteStart + ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);

      oscillator.connect(gain).connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    }
  } catch (error) {
    console.error("Could not play the notification chime.", error);
  }
}

/**
 * Play the chime in response to a user gesture, bypassing the rate limit.
 * Used by the settings toggle so enabling the setting demonstrates the sound.
 */
export function previewNotificationChime(): void {
  primeNotificationChime();
  lastPlayedAtMs = Number.NEGATIVE_INFINITY;
  playNotificationChime();
}
