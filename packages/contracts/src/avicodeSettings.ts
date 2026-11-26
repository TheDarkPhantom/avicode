import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

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
};

export const AVICODE_CLIENT_SETTINGS_PATCH_FIELDS = {
  aviCodeWindowTitleShowNames: Schema.optionalKey(Schema.Boolean),
  aviCodeNewThreadsStartInPlanMode: Schema.optionalKey(Schema.Boolean),
};
