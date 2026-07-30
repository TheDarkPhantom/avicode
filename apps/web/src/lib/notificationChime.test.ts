import { describe, expect, it } from "vite-plus/test";
import { AviCodeNotificationSound } from "@t3tools/contracts/settings";
import { NOTIFICATION_SOUND_PRESETS } from "./notificationChime";

// The audio path itself needs a real AudioContext, which jsdom does not have.
// What is worth pinning is the preset table: it is plain data, and every way
// this feature can be wrong shows up in it.
describe("notification sound presets", () => {
  const ids = Object.keys(NOTIFICATION_SOUND_PRESETS);

  it("covers exactly the ids the settings schema allows", () => {
    expect(new Set(ids)).toEqual(new Set(AviCodeNotificationSound.literals));
  });

  it("gives every preset a playable envelope", () => {
    for (const [id, preset] of Object.entries(NOTIFICATION_SOUND_PRESETS)) {
      expect(preset.label, `${id} needs a label`).toBeTruthy();
      expect(preset.notes.length, `${id} needs at least one note`).toBeGreaterThan(0);
      // Gain is hand-balanced per waveform; these bounds just catch a typo'd
      // decimal point, which would be either inaudible or painfully loud.
      expect(preset.peakGain).toBeGreaterThan(0);
      expect(preset.peakGain).toBeLessThanOrEqual(0.25);
      expect(preset.attackSeconds).toBeGreaterThan(0);
      for (const note of preset.notes) {
        expect(note.frequencyHz).toBeGreaterThan(0);
        expect(note.durationSeconds).toBeGreaterThan(0);
        expect(note.startSeconds).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // The point of offering five is telling them apart across a room. Two sounds
  // that differ only in pitch fail at that; differing in rhythm and timbre is
  // what makes the choice meaningful.
  it("varies shape and timbre, not just pitch", () => {
    const shapes = Object.values(NOTIFICATION_SOUND_PRESETS).map(
      (preset) => `${preset.oscillatorType}:${preset.notes.length}`,
    );
    expect(new Set(shapes).size).toBeGreaterThanOrEqual(3);
    expect(
      new Set(Object.values(NOTIFICATION_SOUND_PRESETS).map((p) => p.oscillatorType)).size,
    ).toBeGreaterThanOrEqual(3);
  });

  // Caught a real one: Glass originally reused the classic chime's A5 + E6.
  // It differed in rhythm (a chord, not a sequence) but sharing both pitches
  // made the two sound like relatives, which defeats offering both.
  it("gives no two presets the same set of pitches", () => {
    const byPitches = new Map<string, string[]>();
    for (const [id, preset] of Object.entries(NOTIFICATION_SOUND_PRESETS)) {
      const key = preset.notes
        .map((note) => note.frequencyHz)
        .sort((a, b) => a - b)
        .join(",");
      byPitches.set(key, [...(byPitches.get(key) ?? []), id]);
    }
    const collisions = [...byPitches.values()].filter((group) => group.length > 1);
    expect(collisions, `presets share pitches: ${JSON.stringify(collisions)}`).toEqual([]);
  });

  it("keeps the classic chime playable as an escape hatch for anyone who liked it", () => {
    const chime = NOTIFICATION_SOUND_PRESETS.chime;
    expect(chime.notes.map((note) => note.frequencyHz)).toEqual([880, 1_318.51]);
    // Rising, and sequential rather than struck together — that is what made
    // it the old sound.
    expect(chime.notes[1]!.startSeconds).toBeGreaterThan(chime.notes[0]!.startSeconds);
  });

  it("leaves the default distinct from the classic chime", () => {
    // Otherwise the whole change is a no-op for the people it is meant to help.
    expect(NOTIFICATION_SOUND_PRESETS.pebble.notes).not.toEqual(
      NOTIFICATION_SOUND_PRESETS.chime.notes,
    );
  });
});
