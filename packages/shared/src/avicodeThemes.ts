import type { ThemeAppearance, ThemeColors, ThemeDefinition } from "./themePalettes.ts";

/** One appearance of a colour theme from the first Avi Code, in its shadcn token names. */
type LegacyPalette = Readonly<{
  background: string;
  foreground: string;
  card: string;
  popover: string;
  primary: string;
  primaryForeground: string;
  primaryHover: string;
  secondary: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  input: string;
  ring: string;
}>;

const OXBLOOD_LIGHT: LegacyPalette = {
  background: "#fcfcfc",
  foreground: "#27272a",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#8b0000",
  primaryForeground: "#ffffff",
  primaryHover: "#991e1e",
  secondary: "#fafafa",
  muted: "#fafafa",
  mutedForeground: "#71717b",
  accent: "#f4f4f5",
  accentForeground: "#18181b",
  border: "#e4e4e7",
  input: "#d4d4d8",
  ring: "#de5257",
};

const OXBLOOD_DARK: LegacyPalette = {
  background: "#0b0808",
  foreground: "#f1e9e4",
  card: "#160d0f",
  popover: "#1a1012",
  primary: "#de5257",
  primaryForeground: "#ffffff",
  primaryHover: "#c5494e",
  secondary: "#201416",
  muted: "#1d1314",
  mutedForeground: "#a79994",
  accent: "#2b191c",
  accentForeground: "#f5f5f5",
  border: "#352124",
  input: "#493035",
  ring: "#de5257",
};

const MIDNIGHT_LIGHT: LegacyPalette = {
  background: "#f7f8fa",
  foreground: "#1e293b",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#1d4ed8",
  primaryForeground: "#ffffff",
  primaryHover: "#3762dc",
  secondary: "#f1f5f9",
  muted: "#f1f5f9",
  mutedForeground: "#64748b",
  accent: "#e2e8f0",
  accentForeground: "#0f172a",
  border: "#e2e8f0",
  input: "#cbd5e1",
  ring: "#3b82f6",
};

const MIDNIGHT_DARK: LegacyPalette = {
  background: "#080b12",
  foreground: "#e6edf7",
  card: "#0d1320",
  popover: "#101828",
  primary: "#4f8ff7",
  primaryForeground: "#071018",
  primaryHover: "#467fdc",
  secondary: "#18202f",
  muted: "#131a27",
  mutedForeground: "#94a3b8",
  accent: "#1d283a",
  accentForeground: "#f1f5f9",
  border: "#253148",
  input: "#35476a",
  ring: "#4f8ff7",
};

const FOREST_LIGHT: LegacyPalette = {
  background: "#f6f8f6",
  foreground: "#1c2b22",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#15803d",
  primaryForeground: "#ffffff",
  primaryHover: "#308e53",
  secondary: "#eef2ee",
  muted: "#eef2ee",
  mutedForeground: "#5f6f66",
  accent: "#e1e9e2",
  accentForeground: "#10221a",
  border: "#dde5de",
  input: "#c6d2c8",
  ring: "#3fa96a",
};

const FOREST_DARK: LegacyPalette = {
  background: "#070b09",
  foreground: "#e6efe9",
  card: "#0d1512",
  popover: "#101a15",
  primary: "#3fa96a",
  primaryForeground: "#04120a",
  primaryHover: "#38965e",
  secondary: "#16211c",
  muted: "#131d19",
  mutedForeground: "#94a89c",
  accent: "#1d2c25",
  accentForeground: "#eaf3ee",
  border: "#24352d",
  input: "#33493d",
  ring: "#3fa96a",
};

const VIOLET_LIGHT: LegacyPalette = {
  background: "#f9f8fc",
  foreground: "#2a2440",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#6d28d9",
  primaryForeground: "#ffffff",
  primaryHover: "#7e41dd",
  secondary: "#f2f0f9",
  muted: "#f2f0f9",
  mutedForeground: "#6b6480",
  accent: "#e9e5f6",
  accentForeground: "#1f1937",
  border: "#e5e1f2",
  input: "#cfc8e6",
  ring: "#8b5cf6",
};

const VIOLET_DARK: LegacyPalette = {
  background: "#09070f",
  foreground: "#ece8f8",
  card: "#120e1d",
  popover: "#171223",
  primary: "#9b7cf0",
  primaryForeground: "#120a24",
  primaryHover: "#896ed5",
  secondary: "#1e1830",
  muted: "#1a1529",
  mutedForeground: "#a09ab8",
  accent: "#272040",
  accentForeground: "#f0ecfb",
  border: "#2f2749",
  input: "#413760",
  ring: "#9b7cf0",
};

const GRAPHITE_LIGHT: LegacyPalette = {
  background: "#fafafa",
  foreground: "#27272a",
  card: "#ffffff",
  popover: "#ffffff",
  primary: "#3f3f46",
  primaryForeground: "#ffffff",
  primaryHover: "#55555c",
  secondary: "#f4f4f5",
  muted: "#f4f4f5",
  mutedForeground: "#71717a",
  accent: "#e4e4e7",
  accentForeground: "#18181b",
  border: "#e4e4e7",
  input: "#d4d4d8",
  ring: "#71717a",
};

const GRAPHITE_DARK: LegacyPalette = {
  background: "#09090b",
  foreground: "#e4e4e7",
  card: "#111113",
  popover: "#18181b",
  primary: "#d4d4d8",
  primaryForeground: "#18181b",
  primaryHover: "#bcbcbf",
  secondary: "#1c1c1f",
  muted: "#18181b",
  mutedForeground: "#a1a1aa",
  accent: "#27272a",
  accentForeground: "#fafafa",
  border: "#2b2b30",
  input: "#3f3f46",
  ring: "#a1a1aa",
};

const PALETTES = [
  { id: "avicode-oxblood", label: "Oxblood", light: OXBLOOD_LIGHT, dark: OXBLOOD_DARK },
  { id: "avicode-midnight", label: "Midnight", light: MIDNIGHT_LIGHT, dark: MIDNIGHT_DARK },
  { id: "avicode-forest", label: "Forest", light: FOREST_LIGHT, dark: FOREST_DARK },
  { id: "avicode-violet", label: "Violet", light: VIOLET_LIGHT, dark: VIOLET_DARK },
  { id: "avicode-graphite", label: "Graphite", light: GRAPHITE_LIGHT, dark: GRAPHITE_DARK },
] as const;

export const AVICODE_THEME_IDS: ReadonlyArray<string> = PALETTES.map(({ id }) => id);

// The old `primary` is the new `accent`, and the old `accent` is the new `accentSurface`.
// Roles the old themes never set (status, search, terminal selection) come from the base.
function themeColors(base: ThemeColors, p: LegacyPalette, appearance: ThemeAppearance) {
  const light = appearance === "light";
  return {
    ...base,
    canvas: p.background,
    chrome: p.background,
    toolbar: p.background,
    toolbarForeground: p.foreground,
    toolbarBorder: p.border,
    toolbarControl: p.card,
    toolbarControlForeground: p.foreground,
    toolbarControlHover: p.accent,
    surface: p.card,
    surfaceRaised: light ? p.card : p.secondary,
    surfaceOverlay: p.popover,
    text: p.foreground,
    textMuted: p.mutedForeground,
    border: p.border,
    input: p.input,
    focus: p.ring,
    accent: p.primary,
    accentForeground: p.primaryForeground,
    secondary: p.secondary,
    secondaryForeground: p.foreground,
    muted: p.muted,
    mutedForeground: p.mutedForeground,
    placeholder: p.mutedForeground,
    secondaryLabel: p.mutedForeground,
    iconMuted: p.mutedForeground,
    update: p.primary,
    updateForeground: light ? p.primary : p.ring,
    updateSurface: p.accent,
    accentSurface: p.accent,
    accentSurfaceForeground: p.accentForeground,
    messageSurface: p.accent,
    messageForeground: p.foreground,
    messageAction: p.primary,
    messageActionForeground: p.primaryForeground,
    messageActionHover: p.primaryHover,
    codeBackground: p.card,
    codeForeground: p.foreground,
    sidebar: light ? p.secondary : p.card,
    sidebarForeground: p.foreground,
    sidebarMutedForeground: p.mutedForeground,
    sidebarControlSurface: light ? p.accent : p.muted,
    sidebarRowHover: light ? p.background : p.accent,
    sidebarRowActive: light ? p.card : p.accent,
    sidebarRowSelected: light ? p.card : p.muted,
    sidebarBorder: p.border,
    terminalBackground: p.background,
    terminalForeground: p.foreground,
    terminalCursor: p.ring,
  } satisfies ThemeColors;
}

/**
 * The first Avi Code's five colour themes. A factory because themePalettes.ts owns the base
 * palettes and lists these as built-ins, so importing its values here would be a cycle.
 */
export function createAvicodeThemes(
  lightBase: ThemeColors,
  darkBase: ThemeColors,
): ReadonlyArray<ThemeDefinition> {
  return PALETTES.map(({ id, label, light, dark }) => ({
    id,
    label,
    appearance: "light",
    colors: themeColors(lightBase, light, "light"),
    variants: { dark: themeColors(darkBase, dark, "dark") },
  }));
}
