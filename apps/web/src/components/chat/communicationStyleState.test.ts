import { describe, expect, it } from "vite-plus/test";
import { COMMUNICATION_STYLE_DEFAULT_ID } from "@t3tools/shared/communicationStyles";

import {
  resolveEffectiveStyleId,
  toCommunicationStyleDirective,
  toCommunicationStyles,
} from "./communicationStyleState";

describe("resolveEffectiveStyleId", () => {
  it("prefers the thread's own choice over the global default", () => {
    expect(
      resolveEffectiveStyleId({ threadStyleId: "caveman", globalStyleId: "business" }),
    ).toBe("caveman");
  });

  it("inherits the global style when the thread has never chosen", () => {
    // This is what makes a new chat start where the last one left off.
    expect(resolveEffectiveStyleId({ threadStyleId: null, globalStyleId: "business" })).toBe(
      "business",
    );
  });

  it("falls back to Default when neither is set", () => {
    expect(resolveEffectiveStyleId({ threadStyleId: null, globalStyleId: null })).toBe(
      COMMUNICATION_STYLE_DEFAULT_ID,
    );
    expect(
      resolveEffectiveStyleId({ threadStyleId: undefined, globalStyleId: undefined }),
    ).toBe(COMMUNICATION_STYLE_DEFAULT_ID);
  });

  it("lets a thread pin Default against a non-default global", () => {
    expect(
      resolveEffectiveStyleId({ threadStyleId: "default", globalStyleId: "caveman" }),
    ).toBe("default");
  });
});

describe("toCommunicationStyles", () => {
  it("maps stored presets into resolvable styles", () => {
    const styles = toCommunicationStyles([
      { id: "custom:terse", label: "Terse", instruction: "Be brief." },
    ]);
    expect(styles).toEqual([
      {
        id: "custom:terse",
        label: "Terse",
        description: "Your own style.",
        instruction: "Be brief.",
        builtIn: false,
      },
    ]);
  });

  it("treats undefined as no custom styles", () => {
    expect(toCommunicationStyles(undefined)).toEqual([]);
  });
});

describe("toCommunicationStyleDirective", () => {
  it("returns undefined for the default style, so nothing goes on the wire", () => {
    expect(toCommunicationStyleDirective(COMMUNICATION_STYLE_DEFAULT_ID, [])).toBeUndefined();
  });

  it("returns the label and instruction for a built-in", () => {
    const directive = toCommunicationStyleDirective("business", []);
    expect(directive?.label).toBe("Business");
    expect(directive?.instruction.length).toBeGreaterThan(0);
  });

  it("returns a custom style's own instruction", () => {
    const custom = toCommunicationStyles([
      { id: "custom:terse", label: "Terse", instruction: "  Be brief.  " },
    ]);
    expect(toCommunicationStyleDirective("custom:terse", custom)).toEqual({
      label: "Terse",
      instruction: "Be brief.",
    });
  });

  it("returns undefined for a style id that no longer exists", () => {
    expect(toCommunicationStyleDirective("custom:deleted", [])).toBeUndefined();
  });
});
