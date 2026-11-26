import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

/** `default` keeps upstream's bundled sound; the rest are synthesised presets. */
export const AviCodeNotificationSound = Schema.Literals([
  "default",
  "pebble",
  "marimba",
  "pluck",
  "glass",
  "chime",
]);
export type AviCodeNotificationSound = typeof AviCodeNotificationSound.Type;

/**
 * Avi Code client settings, spread into `ClientSettingsSchema` and `ClientSettingsPatch`. The
 * `aviCode` prefix keeps them clear of upstream's keys.
 */
export const AVICODE_CLIENT_SETTINGS_FIELDS = {
  /** Time trackers such as ALFRED attribute foreground time by matching these names. */
  aviCodeWindowTitleShowNames: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(true)),
  ),
  aviCodeNotificationSoundInput: AviCodeNotificationSound.pipe(
    Schema.withDecodingDefault(Effect.succeed("default" as const)),
  ),
  aviCodeNotificationSoundCompletion: AviCodeNotificationSound.pipe(
    Schema.withDecodingDefault(Effect.succeed("default" as const)),
  ),
};

export const AVICODE_CLIENT_SETTINGS_PATCH_FIELDS = {
  aviCodeWindowTitleShowNames: Schema.optionalKey(Schema.Boolean),
  aviCodeNotificationSoundInput: Schema.optionalKey(AviCodeNotificationSound),
  aviCodeNotificationSoundCompletion: Schema.optionalKey(AviCodeNotificationSound),
};
