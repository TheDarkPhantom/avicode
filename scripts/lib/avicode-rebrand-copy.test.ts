// @effect-diagnostics nodeBuiltinImport:off - Tests read the committed catalogs directly.
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { describe, expect, it } from "vite-plus/test";

import {
  aviCodeRebrandPlugin,
  loadHashMessage,
  rebrandProductName,
} from "./avicode-rebrand-copy.ts";

const repoRoot = NodePath.resolve(import.meta.dirname, "../..");
const appDir = (app: string) => NodePath.join(repoRoot, "apps", app);
const pluginFor = (app: string) =>
  aviCodeRebrandPlugin(NodeURL.pathToFileURL(`${appDir(app)}/`)) as unknown as {
    load: (id: string) => string | null;
    transform: { handler: (code: string, id: string) => { code: string } | null };
  };

describe("rebrandProductName", () => {
  it("renames the app and keeps names that still mean T3 Code", () => {
    expect(rebrandProductName("Restart T3 Code. T3 Code's logs.")).toBe(
      "Restart Avi Code 2. Avi Code 2's logs.",
    );
    expect(rebrandProductName('Revoke "T3 Code · …" there')).toBe('Revoke "T3 Code · …" there');
    expect(rebrandProductName("Drop T3 Code or VS Code .json files")).toBe(
      "Drop T3 Code or VS Code .json files",
    );
    expect(rebrandProductName("Enable T3 Code SnapShots")).toBe("Enable T3 Code SnapShots");
  });
});

describe("aviCodeRebrandPlugin", () => {
  const plugin = pluginFor("web");
  const source = 'gt("Restart T3 Code.")';

  it("rewrites the sources GT scans and nothing else", () => {
    const rewrite = (file: string) =>
      plugin.transform.handler(source, NodePath.join(repoRoot, file))?.code;
    expect(rewrite("apps/web/src/a.tsx")).toBe('gt("Restart Avi Code 2.")');
    expect(rewrite("packages/client-runtime/src/a.ts?query")).toBe('gt("Restart Avi Code 2.")');
    expect(rewrite("apps/web/src/a.test.tsx")).toBeUndefined();
    expect(rewrite("apps/server/src/a.ts")).toBeUndefined();
    expect(rewrite("apps/web/src/components/changelog/ChangelogPage.tsx")).toBeUndefined();
  });

  it.each(["web", "desktop"])("rehashes the %s catalogs to the rewritten English", (app) => {
    const hashMessage = loadHashMessage(appDir(app));
    const catalogDir = NodePath.join(appDir(app), "src/i18n/translations");
    const load = (locale: string): Record<string, unknown> =>
      JSON.parse(pluginFor(app).load(NodePath.join(catalogDir, `${locale}.json`))!);
    const english = load("en");
    const german = load("de");
    const rebranded = Object.entries(english).filter(([, value]) =>
      JSON.stringify(value).includes("Avi Code 2"),
    );

    expect(rebranded.length).toBeGreaterThan(20);
    for (const [key, value] of rebranded) {
      const formats = ["ICU", "JSX"].map((format) => hashMessage(value, { $format: format }));
      expect(formats).toContain(key);
      expect(german).toHaveProperty(key);
    }
    expect(Object.keys(german).toSorted()).toEqual(Object.keys(english).toSorted());
    expect(
      NodeFS.readFileSync(NodePath.join(catalogDir, "en.json"), "utf8").includes("Avi Code 2"),
    ).toBe(false);
  });
});
