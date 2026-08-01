/**
 * Avi Code addition: choosing which microphone dictation records from.
 *
 * Dictation always called `getUserMedia({ audio })` with no device constraint,
 * so it recorded from whatever the system called default. On a machine with a
 * webcam, a headset, a board array and a virtual mixer, that is frequently not
 * the microphone being spoken into, and the failure is silent: the session
 * connects, the transcription service answers, and the composer stays empty.
 *
 * The pure parts live here so the selection and fallback rules can be tested
 * without a media stack, which jsdom does not provide.
 */

/** Empty means "whatever the system calls default", which is the prior behaviour. */
export const SYSTEM_DEFAULT_DEVICE_ID = "";

export interface AudioInputDevice {
  readonly deviceId: string;
  readonly label: string;
}

/**
 * Browsers withhold device labels until microphone permission has been granted,
 * returning entries with an empty `label`. Naming them by position is more use
 * than a list of blanks, and the count is still accurate.
 */
export function describeAudioInputDevices(
  devices: ReadonlyArray<Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">>,
): AudioInputDevice[] {
  const inputs = devices.filter((device) => device.kind === "audioinput");
  return inputs.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label.trim().length > 0 ? device.label.trim() : `Microphone ${index + 1}`,
  }));
}

/**
 * The device id the picker should show as selected.
 *
 * A saved device that is no longer present (headset unplugged, virtual mixer
 * uninstalled) falls back to the system default in the UI. The recording path
 * deliberately does NOT do this — see `buildAudioConstraints`.
 */
export function resolveSelectedDeviceId(input: {
  readonly savedDeviceId: string;
  readonly devices: ReadonlyArray<AudioInputDevice>;
}): string {
  if (input.savedDeviceId === SYSTEM_DEFAULT_DEVICE_ID) return SYSTEM_DEFAULT_DEVICE_ID;
  return input.devices.some((device) => device.deviceId === input.savedDeviceId)
    ? input.savedDeviceId
    : SYSTEM_DEFAULT_DEVICE_ID;
}

/**
 * Constraints for a dictation capture.
 *
 * A chosen device is requested with `exact`, so an unavailable one fails loudly
 * instead of falling back. `ideal` would silently hand back the system default,
 * which is the exact failure this setting exists to end: the user would have
 * picked their good microphone and still been recorded from the silent one.
 */
export function buildAudioConstraints(deviceId: string): MediaTrackConstraints {
  const base: MediaTrackConstraints = {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
  return deviceId === SYSTEM_DEFAULT_DEVICE_ID ? base : { ...base, deviceId: { exact: deviceId } };
}

/**
 * Whether a `getUserMedia` rejection means "the microphone you chose is gone".
 * Chromium reports it as OverconstrainedError; some engines use NotFoundError
 * with the constrained name attached.
 */
export function isDeviceUnavailableError(error: unknown): boolean {
  if (typeof DOMException === "undefined" || !(error instanceof DOMException)) return false;
  return error.name === "OverconstrainedError" || error.name === "NotFoundError";
}
