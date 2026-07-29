// This suite reads the CSS and HTML on disk to guard the palette against
// drift, so it needs the raw node builtins rather than Effect's FileSystem.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import { describe, expect, it } from "vite-plus/test";

import {
  applyColorThemeAttribute,
  COLOR_THEME_ATTRIBUTE,
  COLOR_THEMES,
  type ColorThemeRoot,
  DEFAULT_COLOR_THEME,
  findColorTheme,
  parseColorThemeId,
} from "./colorTheme";

const WEB_ROOT = NodePath.join(import.meta.dirname, "..", "..");
const themeCss = NodeFS.readFileSync(
  NodePath.join(WEB_ROOT, "src", "styles", "colorThemes.css"),
  "utf8",
);
const indexHtml = NodeFS.readFileSync(NodePath.join(WEB_ROOT, "index.html"), "utf8");

const NON_DEFAULT_THEMES = COLOR_THEMES.filter((theme) => theme.id !== DEFAULT_COLOR_THEME);

function recordingRoot() {
  const calls: Array<{ op: "set" | "remove"; name: string; value?: string }> = [];
  const root: ColorThemeRoot = {
    setAttribute: (name, value) => calls.push({ op: "set", name, value }),
    removeAttribute: (name) => calls.push({ op: "remove", name }),
  };
  return { calls, root };
}

/** The text of a single CSS rule body, given its selector. */
function ruleBody(selector: string): string {
  const start = themeCss.indexOf(`${selector} {`);
  if (start === -1) return "";
  const end = themeCss.indexOf("}", start);
  return themeCss.slice(start, end);
}

describe("parseColorThemeId", () => {
  it("accepts every shipped theme id", () => {
    for (const theme of COLOR_THEMES) {
      expect(parseColorThemeId(theme.id)).toBe(theme.id);
    }
  });

  it("falls back to the default for unknown, empty, or absent values", () => {
    expect(parseColorThemeId(null)).toBe(DEFAULT_COLOR_THEME);
    expect(parseColorThemeId(undefined)).toBe(DEFAULT_COLOR_THEME);
    expect(parseColorThemeId("")).toBe(DEFAULT_COLOR_THEME);
    // A theme id that was removed in a later release must not wedge the app.
    expect(parseColorThemeId("sunset")).toBe(DEFAULT_COLOR_THEME);
  });
});

describe("findColorTheme", () => {
  it("returns the matching definition", () => {
    expect(findColorTheme("forest").label).toBe("Forest");
  });
});

describe("applyColorThemeAttribute", () => {
  // The default palette lives in index.css's :root. Writing
  // data-color-theme="oxblood" would make the override rules in
  // colorThemes.css match, so the default has to clear the attribute instead.
  it("removes the attribute for the default theme", () => {
    const { calls, root } = recordingRoot();
    applyColorThemeAttribute(DEFAULT_COLOR_THEME, root);
    expect(calls).toEqual([{ op: "remove", name: COLOR_THEME_ATTRIBUTE }]);
  });

  it("sets the attribute for every non-default theme", () => {
    for (const theme of NON_DEFAULT_THEMES) {
      const { calls, root } = recordingRoot();
      applyColorThemeAttribute(theme.id, root);
      expect(calls).toEqual([{ op: "set", name: COLOR_THEME_ATTRIBUTE, value: theme.id }]);
    }
  });
});

// The palette is necessarily stated three times — in this module, in
// colorThemes.css, and in index.html's pre-paint script (which cannot import).
// These keep the three from drifting; a mismatch shows up as a flash of the
// wrong colour on load, which is easy to miss by eye.
describe("palette definitions stay in sync", () => {
  it("declares a light and a dark block per non-default theme", () => {
    for (const theme of NON_DEFAULT_THEMES) {
      expect(themeCss).toContain(`html[data-color-theme="${theme.id}"] {`);
      expect(themeCss).toContain(`html[data-color-theme="${theme.id}"].dark {`);
    }
  });

  it("leaves the default theme with no override block", () => {
    expect(themeCss).not.toContain(`data-color-theme="${DEFAULT_COLOR_THEME}"`);
  });

  it("matches each theme's chrome colour to its CSS --theme-background", () => {
    for (const theme of NON_DEFAULT_THEMES) {
      expect(ruleBody(`html[data-color-theme="${theme.id}"]`)).toContain(
        `--theme-background: ${theme.chrome.light};`,
      );
      expect(ruleBody(`html[data-color-theme="${theme.id}"].dark`)).toContain(
        `--theme-background: ${theme.chrome.dark};`,
      );
    }
  });

  it("mirrors every theme's chrome colours into the pre-paint script", () => {
    for (const theme of COLOR_THEMES) {
      expect(indexHtml).toContain(
        `${theme.id}: { light: "${theme.chrome.light}", dark: "${theme.chrome.dark}" },`,
      );
    }
  });

  it("keeps the pre-paint script on the same storage key and default", () => {
    expect(indexHtml).toContain('window.localStorage.getItem("t3code:color-theme")');
    expect(indexHtml).toContain(`const DEFAULT_COLOR_THEME = "${DEFAULT_COLOR_THEME}";`);
  });
});
