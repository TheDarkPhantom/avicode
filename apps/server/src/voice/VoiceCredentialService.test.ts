import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { getVoiceCredential } from "./VoiceCredentialService.ts";

it("hands back the configured key for the dictation socket", () =>
  Effect.gen(function* () {
    const result = yield* getVoiceCredential("dg-key");
    assert.deepEqual(result, { apiKey: "dg-key" });
  }).pipe(Effect.runPromise));

it("fails distinctly when no key is configured", () =>
  Effect.gen(function* () {
    const error = yield* Effect.flip(getVoiceCredential(""));
    assert.equal(error._tag, "VoiceNotConfiguredError");
    // The message names the setting to fill in rather than blaming Deepgram.
    assert.include(error.message, "Settings");
  }).pipe(Effect.runPromise));
