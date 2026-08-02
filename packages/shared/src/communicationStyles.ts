/**
 * Avi Code addition: communication styles.
 *
 * A style is a short instruction appended to what the provider receives for one
 * turn, changing how the agent writes back without changing what it is asked to
 * do. The instruction never enters the persisted transcript — the server splices
 * it into the provider-bound text next to the referenced-thread context — so a
 * thread reads as what the user actually typed.
 *
 * Styles are provider-agnostic on purpose. Every adapter receives the same
 * message text, so this needs no capability on `ProviderAdapterShape` and no
 * per-adapter decision.
 */

export const COMMUNICATION_STYLE_DEFAULT_ID = "default";

/** Longest a custom instruction may be, so one turn cannot be swamped by it. */
export const COMMUNICATION_STYLE_MAX_INSTRUCTION_CHARS = 2_000;
export const COMMUNICATION_STYLE_MAX_LABEL_CHARS = 24;
/** How many styles a user may define beyond the built-ins. */
export const COMMUNICATION_STYLE_MAX_CUSTOM = 12;

export interface CommunicationStyle {
  readonly id: string;
  readonly label: string;
  /** One line for the menu, describing what the style does to the reply. */
  readonly description: string;
  /**
   * Appended to the provider-bound prompt. Empty for the default style, which
   * is the "no instruction at all" case rather than an instruction to be normal.
   */
  readonly instruction: string;
  readonly builtIn: boolean;
}

export const BUILT_IN_COMMUNICATION_STYLES: ReadonlyArray<CommunicationStyle> = [
  {
    id: COMMUNICATION_STYLE_DEFAULT_ID,
    label: "Default",
    description: "However the agent normally writes.",
    instruction: "",
    builtIn: true,
  },
  {
    id: "business",
    label: "Business",
    // Written against a specific failure: the earlier wording capped the length
    // of each item but never the number of them, and "business audience" alone
    // reads as "explain thoroughly". Replies came back correct and far too long
    // for someone who wants to decide and move on. So this caps the whole reply,
    // names what to delete, and asks for the decision rather than the reasoning.
    description: "Answer first, three points, no filler.",
    instruction: [
      "Write for a busy owner or manager who reads this once and then decides.",
      "Open with the answer or outcome in a single sentence.",
      "Then give at most three points, one or two sentences each.",
      "Cut process narration, reasoning they did not ask for, caveats that change",
      "nothing, and any detail they cannot act on.",
      "If something needs their decision, say what it is and put it last.",
      "Do not use em dashes.",
    ].join(" "),
    builtIn: true,
  },
  {
    id: "eli5",
    label: "ELI5",
    description: "Explain from scratch and teach the idea.",
    instruction: [
      "Explain this as if to someone with no prior knowledge, then build up.",
      "Define each term as you introduce it, and teach the underlying idea",
      "rather than only answering the question.",
      "Do not use em dashes.",
    ].join(" "),
    builtIn: true,
  },
  {
    id: "caveman",
    label: "Caveman",
    description: "Ultra caveman speak. Short words, no filler.",
    instruction: [
      "Answer in ultra caveman speak.",
      "Short words. Drop articles, pronouns, and filler.",
      "Grunt when thing bad.",
      "Still be correct: keep real file names, real commands, and real numbers intact.",
      "Do not use em dashes.",
    ].join(" "),
    builtIn: true,
  },
];

export function isDefaultCommunicationStyle(styleId: string | null | undefined): boolean {
  return !styleId || styleId === COMMUNICATION_STYLE_DEFAULT_ID;
}

const BUILT_IN_COMMUNICATION_STYLE_IDS: ReadonlySet<string> = new Set(
  BUILT_IN_COMMUNICATION_STYLES.map((style) => style.id),
);

export function isBuiltInCommunicationStyleId(styleId: string): boolean {
  return BUILT_IN_COMMUNICATION_STYLE_IDS.has(styleId);
}

/**
 * A stored style whose id matches a built-in is an *edit* of that built-in, not
 * a separate entry.
 *
 * This is what makes the built-ins editable without a second settings field and
 * without a reset flag: saving an edit stores a style under the built-in's id,
 * and resetting deletes it, at which point the shipped definition applies again.
 * The built-in's own id and description are kept so the menu still explains what
 * the style is for and so threads that already point at `business` keep
 * resolving after an edit.
 */
function applyStyleOverrides(
  userStyles: ReadonlyArray<CommunicationStyle>,
): ReadonlyArray<CommunicationStyle> {
  return BUILT_IN_COMMUNICATION_STYLES.map((builtIn) => {
    const override = userStyles.find((style) => style.id === builtIn.id);
    if (!override) return builtIn;
    return {
      ...builtIn,
      label: override.label,
      instruction: override.instruction,
      // Still flagged built-in: it occupies a built-in slot, cannot be deleted,
      // and can only be reset. The UI keys its Reset control off this.
      builtIn: true,
    };
  });
}

/** The user's own styles, excluding any that are edits of a built-in. */
export function customCommunicationStyles(
  userStyles: ReadonlyArray<CommunicationStyle> = [],
): ReadonlyArray<CommunicationStyle> {
  return userStyles.filter((style) => !isBuiltInCommunicationStyleId(style.id));
}

/**
 * Resolve a style id against the built-ins plus the user's own. Falls back to
 * the default rather than throwing, so a style deleted while a draft still
 * points at it degrades to a normal reply instead of a broken composer.
 */
export function resolveCommunicationStyle(
  styleId: string | null | undefined,
  userStyles: ReadonlyArray<CommunicationStyle> = [],
): CommunicationStyle {
  const fallback = applyStyleOverrides(userStyles)[0] as CommunicationStyle;
  if (!styleId) return fallback;
  return allCommunicationStyles(userStyles).find((style) => style.id === styleId) ?? fallback;
}

export function allCommunicationStyles(
  userStyles: ReadonlyArray<CommunicationStyle> = [],
): ReadonlyArray<CommunicationStyle> {
  return [...applyStyleOverrides(userStyles), ...customCommunicationStyles(userStyles)];
}

/**
 * Whether a built-in currently differs from what shipped.
 *
 * Compares against the shipped definition rather than tracking a dirty flag, so
 * an edit that happens to restore the original is correctly treated as no edit.
 */
export function isCommunicationStyleEdited(
  styleId: string,
  userStyles: ReadonlyArray<CommunicationStyle> = [],
): boolean {
  const shipped = BUILT_IN_COMMUNICATION_STYLES.find((style) => style.id === styleId);
  const stored = userStyles.find((style) => style.id === styleId);
  if (!shipped || !stored) return false;
  return stored.label !== shipped.label || stored.instruction !== shipped.instruction;
}

/**
 * Wrap an instruction for the provider. Tagged and explicitly scoped to
 * presentation so a style cannot be read as permission to change the work —
 * the same defensive framing the referenced-thread context block uses.
 */
export function serializeCommunicationStyleDirective(instruction: string): string {
  const trimmed = instruction.trim();
  if (trimmed.length === 0) return "";
  return [
    "<communication_style>",
    "The user selected a response style. It governs how you write your reply only.",
    "It does not change what you are asked to do, and it never lowers the bar on",
    "correctness, file paths, commands, or code.",
    "",
    trimmed,
    "</communication_style>",
  ].join("\n");
}

/** A user-defined style id, kept distinct from the built-in namespace. */
export function customCommunicationStyleId(seed: string): string {
  const slug = seed
    .trim()
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 32);
  return `custom:${slug.length > 0 ? slug : "style"}`;
}
