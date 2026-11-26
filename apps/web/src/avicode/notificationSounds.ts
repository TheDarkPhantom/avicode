import type { ClientSettings } from "@t3tools/contracts/settings";
import { msg } from "gt-react";

type NotificationSound = ClientSettings["aviCodeNotificationSoundInput"];
type SynthesisedSound = Exclude<NotificationSound, "default">;
export type NotificationSoundKind = "completion" | "input";

interface SynthNote {
  readonly frequencyHz: number;
  readonly startSeconds: number;
  readonly durationSeconds: number;
}

interface SynthPreset {
  readonly oscillatorType: OscillatorType;
  /** Hand-balanced: a sawtooth carries far more energy than a sine at the same amplitude. */
  readonly peakGain: number;
  readonly attackSeconds: number;
  readonly notes: readonly SynthNote[];
}

export const AVICODE_NOTIFICATION_SOUND_LABELS = {
  default: msg("Default", { $context: "notification sound, the app's built-in sound" }),
  pebble: msg("Pebble", { $context: "notification sound name" }),
  marimba: msg("Marimba", { $context: "notification sound name" }),
  pluck: msg("Pluck", { $context: "notification sound name" }),
  glass: msg("Glass", { $context: "notification sound name" }),
  chime: msg("Chime", { $context: "notification sound name" }),
} satisfies Record<NotificationSound, string>;

/** Presets differ in rhythm and timbre, not just pitch, so they stay distinct across a room. */
export const AVICODE_NOTIFICATION_SOUND_PRESETS = {
  pebble: {
    oscillatorType: "sine",
    peakGain: 0.18,
    attackSeconds: 0.012,
    notes: [{ frequencyHz: 660, startSeconds: 0, durationSeconds: 0.18 }],
  },
  marimba: {
    oscillatorType: "triangle",
    peakGain: 0.16,
    attackSeconds: 0.008,
    notes: [
      { frequencyHz: 1_318.51, startSeconds: 0, durationSeconds: 0.12 },
      { frequencyHz: 1_046.5, startSeconds: 0.08, durationSeconds: 0.12 },
      { frequencyHz: 783.99, startSeconds: 0.16, durationSeconds: 0.2 },
    ],
  },
  pluck: {
    oscillatorType: "sawtooth",
    peakGain: 0.09,
    attackSeconds: 0.004,
    notes: [{ frequencyHz: 440, startSeconds: 0, durationSeconds: 0.14 }],
  },
  glass: {
    oscillatorType: "sine",
    peakGain: 0.12,
    attackSeconds: 0.02,
    notes: [
      { frequencyHz: 1_174.66, startSeconds: 0, durationSeconds: 0.5 },
      { frequencyHz: 1_760, startSeconds: 0, durationSeconds: 0.5 },
    ],
  },
  chime: {
    oscillatorType: "sine",
    peakGain: 0.16,
    attackSeconds: 0.015,
    notes: [
      { frequencyHz: 880, startSeconds: 0, durationSeconds: 0.14 },
      { frequencyHz: 1_318.51, startSeconds: 0.11, durationSeconds: 0.22 },
    ],
  },
} as const satisfies Record<SynthesisedSound, SynthPreset>;

const RELEASE_TAIL_SECONDS = 0.02;

export function avicodeNotificationSoundFor(
  kind: NotificationSoundKind,
  settings: Pick<
    ClientSettings,
    "aviCodeNotificationSoundInput" | "aviCodeNotificationSoundCompletion"
  >,
): NotificationSound {
  return kind === "input"
    ? settings.aviCodeNotificationSoundInput
    : settings.aviCodeNotificationSoundCompletion;
}

export function presetDurationSeconds(preset: SynthPreset): number {
  return (
    Math.max(...preset.notes.map((note) => note.startSeconds + note.durationSeconds)) +
    RELEASE_TAIL_SECONDS
  );
}

/** When each kind's synthesised sound ends, on the audio context's clock. */
const playingUntil = new Map<NotificationSoundKind, number>();

/** Plays a preset on upstream's shared, already running context. */
export function playAviCodeNotificationSound(
  context: AudioContext,
  kind: NotificationSoundKind,
  sound: SynthesisedSound,
  shouldPlay: () => boolean,
): void {
  if (!shouldPlay()) return;
  const startedAt = context.currentTime;
  // Same coalescing as the bundled sounds: one burst is one sound, per kind.
  if (startedAt < (playingUntil.get(kind) ?? 0)) return;
  const preset = AVICODE_NOTIFICATION_SOUND_PRESETS[sound];
  try {
    for (const note of preset.notes) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = preset.oscillatorType;
      oscillator.frequency.value = note.frequencyHz;
      const noteStart = startedAt + note.startSeconds;
      const noteEnd = noteStart + note.durationSeconds;
      // Ramps avoid an audible click; exponential ramps cannot reach zero, hence the floor.
      gain.gain.setValueAtTime(0, noteStart);
      gain.gain.linearRampToValueAtTime(preset.peakGain, noteStart + preset.attackSeconds);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + RELEASE_TAIL_SECONDS);
    }
    playingUntil.set(kind, startedAt + presetDurationSeconds(preset));
  } catch {
    // A context that refuses nodes stays silent; the next alert tries again.
  }
}
