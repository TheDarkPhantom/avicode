import { DEFAULT_CLIENT_SETTINGS } from "@t3tools/contracts/settings";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const audio = { currentTime: 0, oscillators: [] as Array<{ type: string; frequency: number }> };

function fakeContext() {
  const param = () => ({
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {},
  });
  return {
    destination: {},
    get currentTime() {
      return audio.currentTime;
    },
    createGain() {
      return { gain: param(), connect: (node: unknown) => node };
    },
    createOscillator() {
      const oscillator = {
        type: "",
        frequency: { value: 0 },
        connect: (node: unknown) => node,
        start() {
          audio.oscillators.push({ type: oscillator.type, frequency: oscillator.frequency.value });
        },
        stop() {},
      };
      return oscillator;
    },
  } as unknown as AudioContext;
}

async function load() {
  return import("./notificationSounds");
}

beforeEach(() => {
  vi.resetModules();
  audio.currentTime = 0;
  audio.oscillators = [];
});

describe("notification sound settings", () => {
  it("keeps upstream's bundled sounds until the user picks", () => {
    expect(DEFAULT_CLIENT_SETTINGS.aviCodeNotificationSoundInput).toBe("default");
    expect(DEFAULT_CLIENT_SETTINGS.aviCodeNotificationSoundCompletion).toBe("default");
  });

  it("reads the setting that matches the alert kind", async () => {
    const { avicodeNotificationSoundFor } = await load();
    const settings = {
      aviCodeNotificationSoundInput: "marimba",
      aviCodeNotificationSoundCompletion: "glass",
    } as const;
    expect(avicodeNotificationSoundFor("input", settings)).toBe("marimba");
    expect(avicodeNotificationSoundFor("completion", settings)).toBe("glass");
  });

  it("labels every choice and synthesises every choice but the default", async () => {
    const { AVICODE_NOTIFICATION_SOUND_LABELS, AVICODE_NOTIFICATION_SOUND_PRESETS } = await load();
    expect(Object.keys(AVICODE_NOTIFICATION_SOUND_LABELS)).toEqual([
      "default",
      "pebble",
      "marimba",
      "pluck",
      "glass",
      "chime",
    ]);
    expect(Object.keys(AVICODE_NOTIFICATION_SOUND_PRESETS)).toEqual(
      Object.keys(AVICODE_NOTIFICATION_SOUND_LABELS).filter((sound) => sound !== "default"),
    );
  });
});

describe("playAviCodeNotificationSound", () => {
  it("starts one oscillator per note with the preset's waveform", async () => {
    const { playAviCodeNotificationSound } = await load();
    playAviCodeNotificationSound(fakeContext(), "completion", "marimba", () => true);
    expect(audio.oscillators).toEqual([
      { type: "triangle", frequency: 1_318.51 },
      { type: "triangle", frequency: 1_046.5 },
      { type: "triangle", frequency: 783.99 },
    ]);
  });

  it("plays one sound for alerts of the same kind that land together", async () => {
    const { playAviCodeNotificationSound } = await load();
    const context = fakeContext();
    playAviCodeNotificationSound(context, "completion", "pebble", () => true);
    playAviCodeNotificationSound(context, "completion", "pebble", () => true);
    expect(audio.oscillators).toHaveLength(1);

    playAviCodeNotificationSound(context, "input", "pebble", () => true);
    expect(audio.oscillators).toHaveLength(2);

    audio.currentTime = 1;
    playAviCodeNotificationSound(context, "completion", "pebble", () => true);
    expect(audio.oscillators).toHaveLength(3);
  });

  it("stays silent and keeps the slot free when the alert is withdrawn", async () => {
    const { playAviCodeNotificationSound } = await load();
    const context = fakeContext();
    playAviCodeNotificationSound(context, "input", "chime", () => false);
    expect(audio.oscillators).toHaveLength(0);

    playAviCodeNotificationSound(context, "input", "chime", () => true);
    expect(audio.oscillators).toHaveLength(2);
  });
});

describe("playNotificationSound with a picked preset", () => {
  it("synthesises the preset for its kind and keeps the bundled sound for the other", async () => {
    const started = { buffers: 0 };
    class FakeAudioContext {
      state = "running";
      private readonly inner = fakeContext();
      destination = {};
      get currentTime() {
        return audio.currentTime;
      }
      resume() {
        return Promise.resolve();
      }
      decodeAudioData() {
        return Promise.resolve({ duration: 0.6 });
      }
      createBufferSource() {
        return {
          buffer: null,
          connect() {},
          start() {
            started.buffers += 1;
          },
        };
      }
      createOscillator() {
        return this.inner.createOscillator();
      }
      createGain() {
        return this.inner.createGain();
      }
    }
    vi.stubGlobal("AudioContext", FakeAudioContext);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(0) })),
    );
    vi.doMock("../hooks/useSettings", () => ({
      getClientSettings: () => ({
        ...DEFAULT_CLIENT_SETTINGS,
        aviCodeNotificationSoundInput: "glass",
      }),
    }));
    try {
      const { playNotificationSound, unlockNotificationAudio } =
        await import("../threadNotifications");
      unlockNotificationAudio();

      await playNotificationSound("input", () => true);
      expect(audio.oscillators).toHaveLength(2);
      expect(started.buffers).toBe(0);

      await playNotificationSound("completion", () => true);
      expect(started.buffers).toBe(1);
    } finally {
      vi.doUnmock("../hooks/useSettings");
      vi.unstubAllGlobals();
    }
  });
});
