import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import {
  AVICODE_CHIP_MAX,
  AVICODE_CHIP_MAX_LABEL_CHARS,
  AVICODE_CHIP_MAX_TEXT_CHARS,
  DEFAULT_AVICODE_CHIPS,
} from "./avicodeSettings.ts";
import { ClientSettingsPatch, ClientSettingsSchema } from "./settings.ts";

const decodeClientSettings = Schema.decodeUnknownSync(ClientSettingsSchema);
const decodeClientSettingsPatch = Schema.decodeUnknownSync(ClientSettingsPatch);

const chip = (overrides: Partial<Record<"id" | "label" | "color" | "text", string>> = {}) => ({
  id: "ship",
  label: "ship",
  color: "green",
  text: "ship it",
  ...overrides,
});

describe("aviCodeChips", () => {
  it("seeds the two starter chips", () => {
    expect(decodeClientSettings({}).aviCodeChips).toEqual([
      { id: "pr-merge", label: "pr merge", color: "green", text: "pr merge and deploy" },
      { id: "no-deploy", label: "no deploy", color: "orange", text: "pr merge dont deploy" },
    ]);
    expect(DEFAULT_AVICODE_CHIPS).toHaveLength(2);
  });

  it("keeps an empty list once the user removes every chip", () => {
    expect(decodeClientSettings({ aviCodeChips: [] }).aviCodeChips).toEqual([]);
  });

  it("accepts an unknown colour token", () => {
    expect(decodeClientSettingsPatch({ aviCodeChips: [chip({ color: "mauve" })] })).toEqual({
      aviCodeChips: [chip({ color: "mauve" })],
    });
  });

  it("caps the chip count", () => {
    const chips = Array.from({ length: AVICODE_CHIP_MAX }, (_, index) =>
      chip({ id: `chip-${index}` }),
    );
    expect(decodeClientSettingsPatch({ aviCodeChips: chips }).aviCodeChips).toHaveLength(
      AVICODE_CHIP_MAX,
    );
    expect(() =>
      decodeClientSettingsPatch({ aviCodeChips: [...chips, chip({ id: "one-more" })] }),
    ).toThrow();
  });

  it("caps label and message length", () => {
    const longLabel = "x".repeat(AVICODE_CHIP_MAX_LABEL_CHARS + 1);
    const longText = "x".repeat(AVICODE_CHIP_MAX_TEXT_CHARS + 1);
    expect(AVICODE_CHIP_MAX_TEXT_CHARS).toBe(2000);
    expect(() =>
      decodeClientSettingsPatch({ aviCodeChips: [chip({ label: longLabel })] }),
    ).toThrow();
    expect(() => decodeClientSettingsPatch({ aviCodeChips: [chip({ text: longText })] })).toThrow();
  });

  it("rejects a blank label or message", () => {
    expect(() => decodeClientSettingsPatch({ aviCodeChips: [chip({ label: "  " })] })).toThrow();
    expect(() => decodeClientSettingsPatch({ aviCodeChips: [chip({ text: "" })] })).toThrow();
  });
});
