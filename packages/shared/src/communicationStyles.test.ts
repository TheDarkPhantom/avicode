import { describe, expect, it } from "vite-plus/test";

import {
  allCommunicationStyles,
  BUILT_IN_COMMUNICATION_STYLES,
  COMMUNICATION_STYLE_DEFAULT_ID,
  customCommunicationStyleId,
  isDefaultCommunicationStyle,
  resolveCommunicationStyle,
  serializeCommunicationStyleDirective,
  type CommunicationStyle,
} from "./communicationStyles.ts";

const customStyle: CommunicationStyle = {
  id: "custom:terse",
  label: "Terse",
  description: "Your own style.",
  instruction: "Answer in at most three sentences.",
  builtIn: false,
};

describe("built-in styles", () => {
  it("ships Default, Business, ELI5, and Caveman", () => {
    expect(BUILT_IN_COMMUNICATION_STYLES.map((style) => style.id)).toEqual([
      "default",
      "business",
      "eli5",
      "caveman",
    ]);
  });

  it("gives Default an empty instruction, so it adds nothing to a turn", () => {
    const fallback = resolveCommunicationStyle(COMMUNICATION_STYLE_DEFAULT_ID);
    expect(fallback.instruction).toBe("");
    expect(serializeCommunicationStyleDirective(fallback.instruction)).toBe("");
  });

  it("gives every non-default style a real instruction", () => {
    for (const style of BUILT_IN_COMMUNICATION_STYLES.slice(1)) {
      expect(style.instruction.length).toBeGreaterThan(0);
      expect(style.label.length).toBeGreaterThan(0);
    }
  });
});

describe("resolveCommunicationStyle", () => {
  it("finds built-ins by id", () => {
    expect(resolveCommunicationStyle("caveman").label).toBe("Caveman");
  });

  it("finds custom styles by id", () => {
    expect(resolveCommunicationStyle("custom:terse", [customStyle]).label).toBe("Terse");
  });

  it("falls back to Default for an unknown id rather than throwing", () => {
    // A style deleted while a thread still points at it must degrade to a
    // normal reply, not a broken composer.
    expect(resolveCommunicationStyle("custom:deleted", [customStyle]).id).toBe(
      COMMUNICATION_STYLE_DEFAULT_ID,
    );
  });

  it("falls back to Default for null and undefined", () => {
    expect(resolveCommunicationStyle(null).id).toBe(COMMUNICATION_STYLE_DEFAULT_ID);
    expect(resolveCommunicationStyle(undefined).id).toBe(COMMUNICATION_STYLE_DEFAULT_ID);
  });

  it("prefers a built-in when a custom style collides with its id", () => {
    const impostor: CommunicationStyle = { ...customStyle, id: "business", label: "Impostor" };
    expect(resolveCommunicationStyle("business", [impostor]).label).toBe("Business");
  });
});

describe("isDefaultCommunicationStyle", () => {
  it("treats the default id, null, undefined, and empty as default", () => {
    expect(isDefaultCommunicationStyle(COMMUNICATION_STYLE_DEFAULT_ID)).toBe(true);
    expect(isDefaultCommunicationStyle(null)).toBe(true);
    expect(isDefaultCommunicationStyle(undefined)).toBe(true);
    expect(isDefaultCommunicationStyle("")).toBe(true);
    expect(isDefaultCommunicationStyle("business")).toBe(false);
  });
});

describe("allCommunicationStyles", () => {
  it("lists built-ins first, then custom styles", () => {
    const all = allCommunicationStyles([customStyle]);
    expect(all).toHaveLength(BUILT_IN_COMMUNICATION_STYLES.length + 1);
    expect(all[all.length - 1]?.id).toBe("custom:terse");
  });
});

describe("serializeCommunicationStyleDirective", () => {
  it("wraps the instruction and scopes it to presentation only", () => {
    const directive = serializeCommunicationStyleDirective("Be terse.");
    expect(directive).toContain("<communication_style>");
    expect(directive).toContain("</communication_style>");
    expect(directive).toContain("Be terse.");
    // The guard matters: a style must not read as licence to change the work.
    expect(directive).toContain("how you write your reply only");
  });

  it("returns nothing for empty or whitespace instructions", () => {
    expect(serializeCommunicationStyleDirective("")).toBe("");
    expect(serializeCommunicationStyleDirective("   \n  ")).toBe("");
  });
});

describe("customCommunicationStyleId", () => {
  it("namespaces and slugifies the label", () => {
    expect(customCommunicationStyleId("Terse")).toBe("custom:terse");
    expect(customCommunicationStyleId("Exec Summary!")).toBe("custom:exec-summary");
  });

  it("falls back to a usable id when the label has nothing to slugify", () => {
    expect(customCommunicationStyleId("!!!")).toBe("custom:style");
    expect(customCommunicationStyleId("   ")).toBe("custom:style");
  });

  it("never collides with the built-in namespace", () => {
    const builtInIds = new Set(BUILT_IN_COMMUNICATION_STYLES.map((style) => style.id));
    for (const label of ["Default", "Business", "ELI5", "Caveman"]) {
      expect(builtInIds.has(customCommunicationStyleId(label))).toBe(false);
    }
  });
});
