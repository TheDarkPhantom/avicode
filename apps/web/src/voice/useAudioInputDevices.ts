import { useCallback, useEffect, useState } from "react";

import { describeAudioInputDevices, type AudioInputDevice } from "./micDevices.ts";

/**
 * Avi Code addition: the microphones this machine can record from.
 *
 * Re-reads on `devicechange`, so plugging a headset in while the settings page
 * is open adds it without a reload.
 */
export interface AudioInputDevicesState {
  readonly devices: readonly AudioInputDevice[];
  /**
   * True when the browser is withholding device names because microphone
   * permission has not been granted yet. The list is still accurate in count,
   * just anonymous, so the UI offers to unlock the names rather than hiding.
   */
  readonly labelsHidden: boolean;
  readonly refresh: () => void;
}

export function useAudioInputDevices(): AudioInputDevicesState {
  const [devices, setDevices] = useState<readonly AudioInputDevice[]>([]);
  const [labelsHidden, setLabelsHidden] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => setRefreshToken((token) => token + 1), []);

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    let cancelled = false;

    const read = () => {
      void navigator.mediaDevices
        .enumerateDevices()
        .then((found) => {
          if (cancelled) return;
          const inputs = found.filter((device) => device.kind === "audioinput");
          setDevices(describeAudioInputDevices(found));
          setLabelsHidden(
            inputs.length > 0 && inputs.every((device) => device.label.trim().length === 0),
          );
        })
        .catch(() => {
          // Enumeration failing is not worth an error surface: the picker falls
          // back to "System default", which is what dictation always did.
          if (!cancelled) setDevices([]);
        });
    };

    read();
    navigator.mediaDevices.addEventListener?.("devicechange", read);
    return () => {
      cancelled = true;
      navigator.mediaDevices.removeEventListener?.("devicechange", read);
    };
  }, [refreshToken]);

  return { devices, labelsHidden, refresh };
}
