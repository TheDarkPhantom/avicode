import { safeErrorLogAttributes } from "@t3tools/client-runtime/errors";
import * as Schema from "effect/Schema";

/**
 * Avi Code addition: selectable colour themes.
 *
 * Upstream only has the light/dark/system switch in `hooks/useTheme.ts`. This
 * module is the orthogonal axis — *which* palette light and dark are drawn
 * from — and deliberately mirrors useTheme's shape: a plain localStorage key
 * read synchronously, not a `ClientSettings` field. Client settings hydrate
 * asynchronously from the desktop bridge, which would repaint the whole app
 * one frame after load; a palette has to be resolvable before first paint.
 * The pre-paint bootstrap in `index.html` reads the same key.
 *
 * The default theme intentionally writes NO attribute to <html>, so selecting
 * it leaves the upstream `:root` palette in index.css untouched.
 *
 * Palettes live in `src/styles/colorThemes.css`.
 */

export const ColorThemeId = Schema.Literals([
  "oxblood",
  "midnight",
  "forest",
  "violet",
  "graphite",
]);
export type ColorThemeId = typeof ColorThemeId.Type;

export const DEFAULT_COLOR_THEME: ColorThemeId = "oxblood";
export const COLOR_THEME_STORAGE_KEY = "t3code:color-theme";
export const COLOR_THEME_ATTRIBUTE = "data-color-theme";

export type ColorThemeDefinition = {
  readonly id: ColorThemeId;
  readonly label: string;
  readonly description: string;
  /** Accent used for the picker's swatch, per mode. */
  readonly swatch: { readonly light: string; readonly dark: string };
  /**
   * The theme's `--background`, duplicated from colorThemes.css so the
   * pre-paint script and the picker can name a colour without a computed
   * style. `colorTheme.test.ts` asserts these stay in sync with the CSS.
   */
  readonly chrome: { readonly light: string; readonly dark: string };
};

const OXBLOOD: ColorThemeDefinition = {
  id: "oxblood",
  label: "Oxblood",
  description: "The Avi Code default — warm ink and ember actions.",
  swatch: { light: "#8b0000", dark: "#de5257" },
  chrome: { light: "#fcfcfc", dark: "#0b0808" },
};

export const COLOR_THEMES: readonly [ColorThemeDefinition, ...ColorThemeDefinition[]] = [
  OXBLOOD,
  {
    id: "midnight",
    label: "Midnight",
    description: "Cool blue-slate.",
    swatch: { light: "#1d4ed8", dark: "#4f8ff7" },
    chrome: { light: "#f7f8fa", dark: "#080b12" },
  },
  {
    id: "forest",
    label: "Forest",
    description: "Deep green.",
    swatch: { light: "#15803d", dark: "#3fa96a" },
    chrome: { light: "#f6f8f6", dark: "#070b09" },
  },
  {
    id: "violet",
    label: "Violet",
    description: "Muted purple.",
    swatch: { light: "#6d28d9", dark: "#9b7cf0" },
    chrome: { light: "#f9f8fc", dark: "#09070f" },
  },
  {
    id: "graphite",
    label: "Graphite",
    description: "Neutral greys, no hue.",
    swatch: { light: "#3f3f46", dark: "#d4d4d8" },
    chrome: { light: "#fafafa", dark: "#09090b" },
  },
];

export const isColorThemeId = Schema.is(ColorThemeId);

export function findColorTheme(id: ColorThemeId): ColorThemeDefinition {
  return COLOR_THEMES.find((theme) => theme.id === id) ?? OXBLOOD;
}

/** Anything unrecognised — null, a removed theme id, junk — falls back. */
export function parseColorThemeId(raw: string | null | undefined): ColorThemeId {
  return isColorThemeId(raw) ? raw : DEFAULT_COLOR_THEME;
}

export class ColorThemeStorageError extends Schema.TaggedErrorClass<ColorThemeStorageError>()(
  "ColorThemeStorageError",
  {
    operation: Schema.Literals(["read", "write"]),
    storageKey: Schema.String,
    colorTheme: Schema.optional(ColorThemeId),
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} colour theme preference for ${this.storageKey}.`;
  }
}

export const isColorThemeStorageError = Schema.is(ColorThemeStorageError);

export function readColorThemePreference(): ColorThemeId {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(COLOR_THEME_STORAGE_KEY);
  } catch (cause) {
    throw new ColorThemeStorageError({
      operation: "read",
      storageKey: COLOR_THEME_STORAGE_KEY,
      cause,
    });
  }
  return parseColorThemeId(raw);
}

export function writeColorThemePreference(colorTheme: ColorThemeId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COLOR_THEME_STORAGE_KEY, colorTheme);
  } catch (cause) {
    throw new ColorThemeStorageError({
      operation: "write",
      storageKey: COLOR_THEME_STORAGE_KEY,
      colorTheme,
      cause,
    });
  }
}

let colorThemeStorageReadFailure: ColorThemeStorageError | null = null;

export function getStoredColorTheme(): ColorThemeId {
  if (colorThemeStorageReadFailure !== null) return DEFAULT_COLOR_THEME;
  try {
    return readColorThemePreference();
  } catch (cause) {
    const error = isColorThemeStorageError(cause)
      ? cause
      : new ColorThemeStorageError({
          operation: "read",
          storageKey: COLOR_THEME_STORAGE_KEY,
          cause,
        });
    colorThemeStorageReadFailure = error;
    console.error(error.message, {
      operation: error.operation,
      storageKey: error.storageKey,
      ...safeErrorLogAttributes(error),
    });
    return DEFAULT_COLOR_THEME;
  }
}

export function clearColorThemeStorageFailure(): void {
  colorThemeStorageReadFailure = null;
}

/** The <html> surface `applyColorThemeAttribute` needs; narrowed so it is testable. */
export type ColorThemeRoot = {
  setAttribute: (name: string, value: string) => void;
  removeAttribute: (name: string) => void;
};

/**
 * The default theme removes the attribute rather than setting
 * `data-color-theme="oxblood"`, so none of the override rules in
 * colorThemes.css match and index.css's palette applies exactly as upstream
 * wrote it.
 */
export function applyColorThemeAttribute(colorTheme: ColorThemeId, root?: ColorThemeRoot): void {
  const target = root ?? (typeof document === "undefined" ? null : document.documentElement);
  if (!target) return;
  if (colorTheme === DEFAULT_COLOR_THEME) {
    target.removeAttribute(COLOR_THEME_ATTRIBUTE);
    return;
  }
  target.setAttribute(COLOR_THEME_ATTRIBUTE, colorTheme);
}
