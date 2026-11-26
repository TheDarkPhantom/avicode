// @effect-diagnostics nodeBuiltinImport:off - Vite's build plugin runs before an Effect runtime exists.
/**
 * Upstream's UI copy says "T3 Code" in English source strings, and GT keys every translation by a
 * hash of that English. This plugin rewrites the name in the files GT scans at build time and
 * rehashes the catalogs to match, so upstream's sources and catalogs merge untouched.
 */
import * as NodeFS from "node:fs";
import * as NodeModule from "node:module";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import type { Plugin } from "vite-plus";

import { AVICODE_IDENTITY } from "@t3tools/shared/avicodeIdentity";

// Names that still mean T3 Code: the server's peer session label, T3 Code theme files and the
// GNOME extension's registered name.
const UPSTREAM_NAME = /T3 Code(?! · …| or VS Code| SnapShots)/g;

// Its "T3 Code" headings name upstream's changelog sections.
const UNTOUCHED_FILES = ["apps/web/src/components/changelog/ChangelogPage.tsx"];

const REPO_ROOT = NodePath.resolve(import.meta.dirname, "../..");
const SOURCE_FILE = /\.tsx?(?:\?|$)/;
const TEST_FILE = /\.test\.tsx?$/;

type HashMessage = (message: unknown, options: { readonly $format: string }) => string;

export const rebrandProductName = (text: string): string =>
  text.replace(UPSTREAM_NAME, AVICODE_IDENTITY.productName);

const normalize = (file: string) => NodePath.resolve(file.split("?", 1)[0]!).replaceAll("\\", "/");

export function loadHashMessage(appDir: string): HashMessage {
  const fromApp = NodeModule.createRequire(NodePath.join(appDir, "package.json"));
  // Web reaches gt-i18n only through gt-react.
  let entry: string;
  try {
    entry = fromApp.resolve("gt-i18n/internal");
  } catch {
    entry = NodeModule.createRequire(fromApp.resolve("gt-react")).resolve("gt-i18n/internal");
  }
  return (fromApp(entry) as { readonly hashMessage: HashMessage }).hashMessage;
}

/** Old key to new key for every English entry the rewrite changes. */
function rebrandedKeys(
  source: Readonly<Record<string, unknown>>,
  hashMessage: HashMessage,
): ReadonlyMap<string, string> {
  const keys = new Map<string, string>();
  for (const [key, value] of Object.entries(source)) {
    const text = JSON.stringify(value);
    const rebranded = rebrandProductName(text);
    if (rebranded === text) continue;
    // Strings come from gt()/msg() (ICU) or plain <T> children (JSX). An entry with $context hashes
    // neither way and stays under its old key, so other languages show it in English.
    const format = ["ICU", "JSX"].find((each) => hashMessage(value, { $format: each }) === key);
    if (format) keys.set(key, hashMessage(JSON.parse(rebranded), { $format: format }));
  }
  return keys;
}

function rebrandCatalog(raw: string, keys: ReadonlyMap<string, string>): string {
  const catalog: Record<string, unknown> = JSON.parse(rebrandProductName(raw));
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(catalog).map(([key, value]) => [keys.get(key) ?? key, value]),
    ),
  );
}

/** `appDir` holds the app's gt.config.json, which names the scanned sources and the catalogs. */
export function aviCodeRebrandPlugin(appDir: URL): Plugin {
  const dir = NodeURL.fileURLToPath(appDir);
  const config = JSON.parse(NodeFS.readFileSync(NodePath.join(dir, "gt.config.json"), "utf8"));
  const roots = (config.src as string[])
    .filter((glob) => !glob.startsWith("!"))
    .map((glob) => `${normalize(NodePath.join(dir, glob.slice(0, glob.indexOf("*"))))}/`);
  const untouched = UNTOUCHED_FILES.map((file) => normalize(NodePath.join(REPO_ROOT, file)));
  const catalogPath = (locale: string) =>
    normalize(NodePath.join(dir, config.files.gt.output.replace("[locale]", locale)));
  const catalogs = new Set(
    [config.defaultLocale as string, ...(config.locales as string[])].map(catalogPath),
  );
  let keys: ReadonlyMap<string, string> | undefined;

  return {
    name: "avicode:rebrand-copy",
    enforce: "pre",
    // Tests assert upstream's English.
    apply: (_config, env) => env.mode !== "test",
    load(id) {
      const file = normalize(id);
      if (!catalogs.has(file)) return null;
      keys ??= rebrandedKeys(
        JSON.parse(NodeFS.readFileSync(catalogPath(config.defaultLocale), "utf8")),
        loadHashMessage(dir),
      );
      return rebrandCatalog(NodeFS.readFileSync(file, "utf8"), keys);
    },
    transform: {
      filter: { id: SOURCE_FILE, code: "T3 Code" },
      handler(code, id) {
        const file = normalize(id);
        if (TEST_FILE.test(file) || untouched.includes(file)) return null;
        if (!roots.some((root) => file.startsWith(root))) return null;
        return { code: rebrandProductName(code), map: null };
      },
    },
  };
}
