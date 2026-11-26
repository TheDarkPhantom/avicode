import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { TrimmedNonEmptyString } from "./baseSchemas.ts";

export const AVICODE_CHIP_MAX = 10;
export const AVICODE_CHIP_MAX_LABEL_CHARS = 24;
export const AVICODE_CHIP_MAX_TEXT_CHARS = 2000;

/** A quick-send chip: clicking it in the composer sends `text` as a message. */
export const AviCodeChip = Schema.Struct({
  id: TrimmedNonEmptyString,
  label: TrimmedNonEmptyString.check(Schema.isMaxLength(AVICODE_CHIP_MAX_LABEL_CHARS)),
  /** A palette token resolved on the client, so an unknown one falls back instead of failing. */
  color: TrimmedNonEmptyString,
  text: TrimmedNonEmptyString.check(Schema.isMaxLength(AVICODE_CHIP_MAX_TEXT_CHARS)),
});
export type AviCodeChip = typeof AviCodeChip.Type;

export const DEFAULT_AVICODE_CHIPS: ReadonlyArray<AviCodeChip> = [
  { id: "pr-merge", label: "pr merge", color: "green", text: "pr merge and deploy" },
  { id: "no-deploy", label: "no deploy", color: "orange", text: "pr merge dont deploy" },
];

const AviCodeChips = Schema.Array(AviCodeChip).check(Schema.isMaxLength(AVICODE_CHIP_MAX));

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
  /** New chats open in plan mode instead of the mode carried from the current chat. */
  aviCodeNewThreadsStartInPlanMode: Schema.Boolean.pipe(
    Schema.withDecodingDefault(Effect.succeed(false)),
  ),
  /** Quick-send chips shown under the composer while its input is empty. */
  aviCodeChips: AviCodeChips.pipe(
    Schema.withDecodingDefault(Effect.succeed(DEFAULT_AVICODE_CHIPS)),
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
  aviCodeNewThreadsStartInPlanMode: Schema.optionalKey(Schema.Boolean),
  aviCodeChips: Schema.optionalKey(AviCodeChips),
  aviCodeNotificationSoundInput: Schema.optionalKey(AviCodeNotificationSound),
  aviCodeNotificationSoundCompletion: Schema.optionalKey(AviCodeNotificationSound),
};
