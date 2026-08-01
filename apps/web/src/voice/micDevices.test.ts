import { describe, expect, it } from "vite-plus/test";

import {
  buildAudioConstraints,
  describeAudioInputDevices,
  isDeviceUnavailableError,
  resolveSelectedDeviceId,
  SYSTEM_DEFAULT_DEVICE_ID,
} from "./micDevices";

function device(kind: MediaDeviceKind, deviceId: string, label: string) {
  return { kind, deviceId, label };
}

describe("describeAudioInputDevices", () => {
  it("keeps only microphones", () => {
    const described = describeAudioInputDevices([
      device("audioinput", "mic-1", "HyperX DuoCast"),
      device("audiooutput", "spk-1", "Speakers"),
      device("videoinput", "cam-1", "C920"),
    ]);
    expect(described).toEqual([{ deviceId: "mic-1", label: "HyperX DuoCast" }]);
  });

  it("names devices by position while labels are withheld", () => {
    // Browsers blank the labels until microphone permission is granted. A list
    // of empty strings is unusable; numbered entries at least say how many.
    const described = describeAudioInputDevices([
      device("audioinput", "mic-1", ""),
      device("audioinput", "mic-2", "   "),
    ]);
    expect(described.map((d) => d.label)).toEqual(["Microphone 1", "Microphone 2"]);
  });
});

describe("resolveSelectedDeviceId", () => {
  const devices = [
    { deviceId: "mic-1", label: "HyperX DuoCast" },
    { deviceId: "mic-2", label: "C920" },
  ];

  it("keeps a saved device that is still present", () => {
    expect(resolveSelectedDeviceId({ savedDeviceId: "mic-2", devices })).toBe("mic-2");
  });

  it("falls back in the picker when the saved device is gone", () => {
    // Unplugging a headset should not leave the settings page showing a
    // selection that no longer exists.
    expect(resolveSelectedDeviceId({ savedDeviceId: "mic-gone", devices })).toBe(
      SYSTEM_DEFAULT_DEVICE_ID,
    );
  });

  it("passes the system default through", () => {
    expect(resolveSelectedDeviceId({ savedDeviceId: SYSTEM_DEFAULT_DEVICE_ID, devices })).toBe(
      SYSTEM_DEFAULT_DEVICE_ID,
    );
  });
});

describe("buildAudioConstraints", () => {
  it("omits deviceId for the system default, preserving the prior behaviour", () => {
    expect(buildAudioConstraints(SYSTEM_DEFAULT_DEVICE_ID)).toEqual({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
  });

  it("pins a chosen device with exact, so it cannot silently fall back", () => {
    // `ideal` would hand back the system default when the chosen microphone is
    // missing, which is precisely the silent failure this setting exists to
    // end: the user picks their good microphone and is recorded from the dead
    // one anyway, with nothing on screen to say so.
    expect(buildAudioConstraints("mic-1").deviceId).toEqual({ exact: "mic-1" });
  });
});

describe("isDeviceUnavailableError", () => {
  it("recognises the rejections that mean the chosen device is gone", () => {
    expect(isDeviceUnavailableError(new DOMException("", "OverconstrainedError"))).toBe(true);
    expect(isDeviceUnavailableError(new DOMException("", "NotFoundError"))).toBe(true);
  });

  it("leaves a blocked permission to the permission message", () => {
    expect(isDeviceUnavailableError(new DOMException("", "NotAllowedError"))).toBe(false);
    expect(isDeviceUnavailableError(new Error("boom"))).toBe(false);
  });
});
