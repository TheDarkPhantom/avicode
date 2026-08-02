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

/**
 * Resolve a style id against the built-ins plus the user's own. Falls back to
 * the default rather than throwing, so a style deleted while a draft still
 * points at it degrades to a normal reply instead of a broken composer.
 */
export function resolveCommunicationStyle(
  styleId: string | null | undefined,
  customStyles: ReadonlyArray<CommunicationStyle> = [],
): CommunicationStyle {
  const fallback = BUILT_IN_COMMUNICATION_STYLES[0] as CommunicationStyle;
  if (!styleId) return fallback;
  return (
    BUILT_IN_COMMUNICATION_STYLES.find((style) => style.id === styleId) ??
    customStyles.find((style) => style.id === styleId) ??
    fallback
  );
}

export function allCommunicationStyles(
  customStyles: ReadonlyArray<CommunicationStyle> = [],
): ReadonlyArray<CommunicationStyle> {
  return [...BUILT_IN_COMMUNICATION_STYLES, ...customStyles];
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
