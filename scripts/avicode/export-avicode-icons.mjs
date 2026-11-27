#!/usr/bin/env node
// Avi Code addition: renders every Avi Code 2 icon from the SVGs in assets/prod, on any OS.
// Upstream's icons:export needs Icon Composer on macOS; this replaces it for the fork.
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";
import sharp from "sharp";

import { BRAND_ASSET_PATHS as P, DEVELOPMENT_PUBLIC_ICON_OVERRIDES } from "../lib/brand-assets.ts";
import { encodePngIco, WINDOWS_ICON_SIZES } from "../lib/icon-export.ts";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "../..",
);
const readSource = (name) => NodeFSP.readFile(NodePath.join(repoRoot, "assets/prod", name), "utf8");

const full = await readSource("logo.svg");
// Below 32px the brackets and the "2" turn to mush, so the small sizes have their own drawings.
const small24 = await readSource("logo-24.svg");
const small16 = await readSource("logo-16.svg");
const sourceFor = (size) => (size <= 16 ? small16 : size <= 24 ? small24 : full);

const render = (svg, size) =>
  sharp(Buffer.from(svg), { density: (72 * size) / 256 })
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toBuffer();

// macOS pre-Tahoe safe area: an 824px body inset 100px on a 1024px canvas.
const tileOnly = full.replace('viewBox="0 0 256 256"', 'viewBox="8 8 240 240"');
const mac = await sharp(
  await sharp(Buffer.from(tileOnly), { density: (72 * 824) / 240 })
    .resize(824, 824)
    .png()
    .toBuffer(),
)
  .extend({ top: 100, bottom: 100, left: 100, right: 100, background: "#0000" })
  .png({ compressionLevel: 9 })
  .toBuffer();

const ico = encodePngIco(
  await Promise.all(
    WINDOWS_ICON_SIZES.map(async (size) => ({
      size,
      contents: await render(sourceFor(size), size),
    })),
  ),
);
const square = await render(full, 1024);
const favicon16 = await render(small16, 16);
const favicon32 = await render(full, 32);
const icon180 = await render(full, 180);
const icon192 = await render(full, 192);
const icon512 = await render(full, 512);

const outputs = new Map([
  [P.productionWindowsIconIco, ico],
  [P.productionWebFaviconIco, ico],
  [P.productionWebFavicon16Png, favicon16],
  [P.productionWebFavicon32Png, favicon32],
  [P.productionWebAppleTouchIconPng, icon180],
  [P.productionWebIcon192Png, icon192],
  [P.productionWebIcon512Png, icon512],
  [P.productionIosIconPng, square],
  [P.productionLinuxIconPng, square],
  [P.productionMacIconPng, mac],
  [P.developmentWindowsIconIco, ico],
  [P.developmentWebFaviconIco, ico],
  [P.developmentWebFavicon16Png, favicon16],
  [P.developmentWebFavicon32Png, favicon32],
  [P.developmentWebAppleTouchIconPng, icon180],
  [P.developmentWebIcon192Png, icon192],
  [P.developmentWebIcon512Png, icon512],
  [P.developmentIosIconPng, square],
  [P.developmentUniversalIconPng, square],
  [P.developmentDesktopIconPng, mac],
]);
for (const { sourceRelativePath, targetRelativePath } of DEVELOPMENT_PUBLIC_ICON_OVERRIDES) {
  outputs.set(targetRelativePath, outputs.get(sourceRelativePath));
}

for (const [relativePath, contents] of outputs) {
  await NodeFSP.writeFile(NodePath.join(repoRoot, relativePath), contents);
  console.log(`wrote ${relativePath}`);
}
