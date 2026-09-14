// Avi Code addition. Resilient client-settings decode.
//
// `ClientSettingsSchema` is a struct where every field carries a
// `withDecodingDefault`. That default only fills a *missing* key, so a single
// present-but-invalid field (a value out of range, a renamed literal option, an
// oversized array) fails the whole struct decode. Both persistence surfaces then
// fall back to `DEFAULT_CLIENT_SETTINGS` and it looks like every setting reset.
//
// This decodes field-by-field first: any field whose value fails validation is
// dropped so the struct-level default refills it, while every other valid field
// survives. Only a truly unusable blob falls all the way back to defaults.
import {
  ClientSettingsSchema,
  DEFAULT_CLIENT_SETTINGS,
  type ClientSettings,
} from "@t3tools/contracts";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

const fieldDecoders = Object.fromEntries(
  Object.entries(ClientSettingsSchema.fields).map(([key, fieldSchema]) => [
    key,
    Schema.decodeUnknownOption(fieldSchema),
  ]),
) as Record<string, (input: unknown) => Option.Option<unknown>>;

const knownKeys = Object.keys(ClientSettingsSchema.fields);

const decodeStruct = Schema.decodeUnknownExit(ClientSettingsSchema);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Decode a parsed (already `JSON.parse`d) client-settings value, keeping every
 * valid field and defaulting only the invalid or missing ones. Never throws;
 * an unusable value yields `DEFAULT_CLIENT_SETTINGS`.
 */
export function decodeClientSettingsResilient(raw: unknown): ClientSettings {
  if (!isPlainObject(raw)) {
    return DEFAULT_CLIENT_SETTINGS;
  }

  const pruned: Record<string, unknown> = { ...raw };
  for (const key of knownKeys) {
    if (!(key in raw)) {
      continue;
    }
    const decodeField = fieldDecoders[key];
    if (decodeField && Option.isNone(decodeField(raw[key]))) {
      // Drop the invalid value so the struct's withDecodingDefault refills it.
      delete pruned[key];
    }
  }

  const exit = decodeStruct(pruned);
  return Exit.isSuccess(exit) ? exit.value : DEFAULT_CLIENT_SETTINGS;
}
