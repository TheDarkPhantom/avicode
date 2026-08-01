/**
 * The attention chime: a short tone synthesized with the Web Audio API.
 *
 * Synthesized rather than a shipped audio file so there is no asset to load,
 * cache-bust, or license — and so it works on a cold offline start. Adding
 * choices therefore costs a few numbers each, not five more binaries.
 */

import type { AviCodeNotificationSound } from "@t3tools/contracts/settings";

interface NotificationSoundNote {
  readonly frequencyHz: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

interface NotificationSoundPreset {
  readonly label: string;
  readonly oscillatorType: OscillatorType;
  readonly peakGain: number;
  readonly attackSeconds: number;
  readonly notes: readonly NotificationSoundNote[];
}

/**
 * Avi Code addition. The original chime was the only option, and it is a rising
 * two-note sine — the same shape several other desktop tools use, so hearing it
 * did not tell you *which* app wanted you.
 *
 * These five are deliberately different in shape, not just pitch: one note
 * versus three, rising versus falling versus simultaneous, and four different
 * waveforms. Two sounds that differ only in pitch are hard to tell apart across
 * a room; two that differ in rhythm and timbre are not.
 *
 * Peak gains are hand-balanced rather than shared. A sawtooth carries far more
 * energy than a sine at the same amplitude, so a single constant would make
 * Pluck harsh and Glass inaudible.
 */
export const NOTIFICATION_SOUND_PRESETS = {
  // Single soft mid tone. The default: present enough to notice, plain enough
  // not to grate on the twentieth repeat of a long session.
  pebble: {
    label: "Pebble",
    oscillatorType: "sine",
    peakGain: 0.18,
    attackSeconds: 0.012,
    notes: [{ frequencyHz: 660, startSeconds: 0, durationSeconds: 0.18 }],
  },
  // Three descending triangle notes (E6, C6, G5) — a falling figure reads as
  // "done" where a rising one reads as "look here".
  marimba: {
    label: "Marimba",
    oscillatorType: "triangle",
    peakGain: 0.16,
    attackSeconds: 0.008,
    notes: [
      { frequencyHz: 1_318.51, startSeconds: 0, durationSeconds: 0.12 },
      { frequencyHz: 1_046.5, startSeconds: 0.08, durationSeconds: 0.12 },
      { frequencyHz: 783.99, startSeconds: 0.16, durationSeconds: 0.2 },
    ],
  },
  // Short sawtooth with a fast decay: the most percussive of the set, for
  // people who want a tap rather than a tone.
  pluck: {
    label: "Pluck",
    oscillatorType: "sawtooth",
    peakGain: 0.09,
    attackSeconds: 0.004,
    notes: [{ frequencyHz: 440, startSeconds: 0, durationSeconds: 0.14 }],
  },
  // A fifth (D6 + A6) struck together and left to ring. The only preset whose
  // notes overlap, which is what gives it a chord rather than a melody.
  //
  // Deliberately not A5 + E6: that is the classic chime's pair, and two presets
  // sharing both pitches sound like relatives even when their rhythm differs.
  // Sitting a whole tone up keeps the interval but not the confusion.
  glass: {
    label: "Glass",
    oscillatorType: "sine",
    peakGain: 0.12,
    attackSeconds: 0.02,
    notes: [
      { frequencyHz: 1_174.66, startSeconds: 0, durationSeconds: 0.5 },
      { frequencyHz: 1_760, startSeconds: 0, durationSeconds: 0.5 },
    ],
  },
  // The original A5 → E6 rising sine, kept so anyone who liked it can keep it.
  chime: {
    label: "Chime (classic)",
    oscillatorType: "sine",
    peakGain: 0.16,
    attackSeconds: 0.015,
    notes: [
      { frequencyHz: 880, startSeconds: 0, durationSeconds: 0.14 },
      { frequencyHz: 1_318.51, startSeconds: 0.11, durationSeconds: 0.22 },
    ],
  },
} as const satisfies Record<AviCodeNotificationSound, NotificationSoundPreset>;

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

/**
 * Keep trying to unblock audio until a user gesture actually lands.
 *
 * Browsers refuse to start an AudioContext until the page has been interacted
 * with, and `resume()` only takes from inside a gesture handler. Without this
 * the only thing that ever unblocked the chime was the settings toggle, so an
 * app launched and left alone stayed mute for the first thread to finish —
 * which is the one case the chime exists for.
 *
 * Capture-phase listeners so a handler that stops propagation cannot swallow
 * the gesture. Both are removed as soon as the context reports `running`;
 * `resume()` is async, so the first gesture usually arms it and the second
 * confirms it.
 */
export function installNotificationChimeGestureUnlock(): () => void {
  if (typeof document === "undefined") return () => {};

  const teardown = (): void => {
    document.removeEventListener("pointerdown", handleGesture, true);
    document.removeEventListener("keydown", handleGesture, true);
  };
  function handleGesture(): void {
    primeNotificationChime();
    if (sharedContext?.state === "running") teardown();
  }

  document.addEventListener("pointerdown", handleGesture, true);
  document.addEventListener("keydown", handleGesture, true);
  return teardown;
}

export function playNotificationChime(sound: AviCodeNotificationSound): void {
  const context = ensureAudioContext();
  if (context === null) return;
  if (context.state !== "running") {
    // Scheduling against a suspended context does not delay the tone, it
    // strands it: `currentTime` is frozen, so every note lands in the past and
    // fires the instant audio is unblocked — a chime arriving on the user's
    // next click for a thread that finished minutes ago. Stay silent and try
    // to unblock for next time instead.
    primeNotificationChime();
    return;
  }

  const nowMs = Date.now();
  if (nowMs - lastPlayedAtMs < MINIMUM_INTERVAL_MS) return;
  lastPlayedAtMs = nowMs;

  const preset = NOTIFICATION_SOUND_PRESETS[sound];

  try {
    const startedAt = context.currentTime;
    for (const note of preset.notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = preset.oscillatorType;
      oscillator.frequency.value = note.frequencyHz;

      const noteStart = startedAt + note.startSeconds;
      const noteEnd = noteStart + note.durationSeconds;
      // Ramped rather than stepped at both ends: a square-edged gain change
      // is an audible click. Exponential ramps cannot reach zero, hence the
      // small floor before the oscillator stops.
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(preset.peakGain, noteStart + preset.attackSeconds);
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
 * Play a sound in response to a user gesture, bypassing the rate limit. Used by
 * the settings controls so enabling the setting, or picking a different sound,
 * demonstrates it immediately.
 */
export function previewNotificationChime(sound: AviCodeNotificationSound): void {
  lastPlayedAtMs = Number.NEGATIVE_INFINITY;
  const context = ensureAudioContext();
  if (context === null) return;
  // `resume()` resolves after the gesture unblocks audio. Playing before it
  // settles would hit the suspended-context guard and demo nothing, which is
  // exactly the cold start where the user is most likely to be testing this.
  if (context.state === "suspended") {
    void context
      .resume()
      .then(() => {
        playNotificationChime(sound);
      })
      .catch((error: unknown) => {
        console.error("Could not resume the notification audio context.", error);
      });
    return;
  }
  playNotificationChime(sound);
}
