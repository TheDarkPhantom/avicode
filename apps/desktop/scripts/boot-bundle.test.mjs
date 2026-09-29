import * as NodeChildProcess from "node:child_process";
import * as NodeFSP from "node:fs/promises";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import { build } from "vite-plus/pack";
import { assert, it } from "vite-plus/test";

import desktopConfig from "../vite.config.ts";

const desktopDir = NodePath.resolve(NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)), "..");

it("loads the emitted packaged boot entry and backend cache preload", async () => {
  const directory = await NodeFSP.mkdtemp(NodePath.join(NodeOS.tmpdir(), "avicode-desktop-boot-"));
  try {
    const entries = new Set(["src/boot.ts", "src/compileCache.ts"]);
    const outputDirectory = NodePath.join(directory, "dist-electron");
    assert.ok(Array.isArray(desktopConfig.pack));
    let built = 0;
    for (const packConfig of desktopConfig.pack) {
      if (!Array.isArray(packConfig.entry)) continue;
      if (!packConfig.entry.some((entry) => entries.has(entry))) continue;
      await build({
        ...packConfig,
        config: false,
        cwd: desktopDir,
        outDir: outputDirectory,
        sourcemap: false,
        onSuccess: undefined,
        logLevel: "silent",
      });
      built += 1;
    }
    assert.equal(built, 1);

    // boot.cjs must load main.cjs at runtime rather than inline it.
    const boot = await NodeFSP.readFile(NodePath.join(outputDirectory, "boot.cjs"), "utf8");
    assert.include(boot, "./main.cjs");
    assert.include(boot, "./compileCache.cjs");

    const report = `const dir = require('node:module').getCompileCacheDir(); console.log(dir ? (dir.includes('avicode') ? 'cached' : 'wrong-dir') : 'uncached');`;
    await NodeFSP.writeFile(NodePath.join(outputDirectory, "main.cjs"), report);
    await NodeFSP.writeFile(
      NodePath.join(outputDirectory, "backend.mjs"),
      `import { createRequire } from 'node:module'; const require = createRequire(import.meta.url); ${report}`,
    );
    for (const disabled of [false, true]) {
      for (const args of [
        [NodePath.join(outputDirectory, "boot.cjs")],
        [
          "--require",
          NodePath.join(outputDirectory, "compileCache.cjs"),
          NodePath.join(outputDirectory, "backend.mjs"),
        ],
      ]) {
        const child = NodeChildProcess.spawnSync(process.execPath, args, {
          encoding: "utf8",
          env: {
            ...process.env,
            APPIMAGE: "",
            NODE_COMPILE_CACHE: undefined,
            NODE_DISABLE_COMPILE_CACHE: disabled ? "1" : undefined,
            XDG_CACHE_HOME: directory,
            TMPDIR: directory,
            TEMP: directory,
            TMP: directory,
          },
        });
        assert.equal(child.status, 0, child.stderr);
        assert.equal(child.stdout.trim(), disabled ? "uncached" : "cached");
      }
    }
  } finally {
    await NodeFSP.rm(directory, { recursive: true, force: true });
  }
});
