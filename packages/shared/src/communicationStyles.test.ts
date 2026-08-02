import { describe, expect, it } from "vite-plus/test";
import {
  COMMUNICATION_STYLE_EDITABLE_BUILT_INS,
  COMMUNICATION_STYLE_MAX_CUSTOM,
  COMMUNICATION_STYLE_MAX_STORED,
} from "@t3tools/contracts";

import {
  allCommunicationStyles,
  BUILT_IN_COMMUNICATION_STYLES,
  COMMUNICATION_STYLE_DEFAULT_ID,
  customCommunicationStyleId,
  customCommunicationStyles,
  isBuiltInCommunicationStyleId,
  isCommunicationStyleEdited,
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

  it("lets a stored style under a built-in id edit that built-in", () => {
    // This is how editing a built-in is stored: same id, user's wording. It is
    // deliberately not treated as a separate entry, so deleting it is the reset.
    const edited: CommunicationStyle = {
      ...customStyle,
      id: "business",
      label: "Exec",
      instruction: "One paragraph, no lists.",
    };
    const resolved = resolveCommunicationStyle("business", [edited]);
    expect(resolved.label).toBe("Exec");
    expect(resolved.instruction).toBe("One paragraph, no lists.");
    // The built-in's own description survives, so the menu still says what the
    // style is for rather than going blank.
    expect(resolved.description).toBe("Answer first, three points, no filler.");
    expect(resolved.builtIn).toBe(true);
  });

  it("restores the shipped built-in once the edit is removed", () => {
    expect(resolveCommunicationStyle("business", []).label).toBe("Business");
    expect(resolveCommunicationStyle("business", []).instruction).toContain(
      "busy owner or manager",
    );
  });
});

describe("editing built-ins", () => {
  const editedBusiness: CommunicationStyle = {
    id: "business",
    label: "Exec",
    description: "Your own style.",
    instruction: "One paragraph, no lists.",
    builtIn: false,
  };

  it("does not list an edited built-in twice", () => {
    const all = allCommunicationStyles([editedBusiness, customStyle]);
    expect(all.filter((style) => style.id === "business")).toHaveLength(1);
    expect(all.map((style) => style.id)).toEqual([
      "default",
      "business",
      "eli5",
      "caveman",
      "custom:terse",
    ]);
  });

  it("separates edits of built-ins from genuinely custom styles", () => {
    // The custom-style limit must not be consumed by editing a built-in.
    expect(customCommunicationStyles([editedBusiness, customStyle])).toEqual([customStyle]);
  });

  it("reports whether a built-in differs from what shipped", () => {
    expect(isCommunicationStyleEdited("business", [editedBusiness])).toBe(true);
    expect(isCommunicationStyleEdited("business", [])).toBe(false);
    expect(isCommunicationStyleEdited("custom:terse", [customStyle])).toBe(false);
  });

  it("treats an edit that matches the shipped wording as no edit", () => {
    const shipped = BUILT_IN_COMMUNICATION_STYLES.find((style) => style.id === "business");
    const identical: CommunicationStyle = { ...editedBusiness, ...shipped } as CommunicationStyle;
    expect(isCommunicationStyleEdited("business", [identical])).toBe(false);
  });

  it("knows which ids are built-in", () => {
    expect(isBuiltInCommunicationStyleId("business")).toBe(true);
    expect(isBuiltInCommunicationStyleId("custom:terse")).toBe(false);
  });

  it("keeps the contract's stored-array headroom in step with the built-ins", () => {
    // Contracts is schema-only and cannot import the style list, so it states
    // the editable count as a number. Adding a built-in must fail here rather
    // than silently costing someone one of their custom slots.
    const editable = BUILT_IN_COMMUNICATION_STYLES.filter(
      (style) => style.instruction.length > 0,
    ).length;
    expect(editable).toBe(COMMUNICATION_STYLE_EDITABLE_BUILT_INS);
    expect(COMMUNICATION_STYLE_MAX_STORED).toBe(
      COMMUNICATION_STYLE_MAX_CUSTOM + COMMUNICATION_STYLE_EDITABLE_BUILT_INS,
    );
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
