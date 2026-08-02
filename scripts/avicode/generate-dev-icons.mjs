/**
 * Rasterize the Avi Code development mark into the dev-build icon slots.
 *
 * Why this exists rather than `vp run icons:export`: that pipeline drives Apple's
 * Icon Composer, which only runs on macOS. This fork is Windows-only, so it can
 * never regenerate its own icons through it, and the dev slots were still holding
 * upstream's blueprint "T3" art as a result. This renders the same slots from an
 * SVG with `sharp`, which runs anywhere.
 *
 * Scope is deliberately the development variant only. `assets/prod/` already holds
 * the Avi Code mark and is what packaged builds stage from, so production needs
 * nothing. `assets/nightly/` is left alone because this fork never builds that
 * channel.
 *
 * Run from the repository root:
 *
 *   node scripts/avicode/generate-dev-icons.mjs
 */
import * as NodeBuffer from "node:buffer";
import * as NodeFSP from "node:fs/promises";
import * as NodePath from "node:path";
import * as NodeURL from "node:url";

import sharp from "sharp";

const repoRoot = NodePath.resolve(
  NodePath.dirname(NodeURL.fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const sourceSvgPath = NodePath.join(repoRoot, "assets", "dev", "avicode-dev-logo.svg");

/** Sizes Windows picks between for the taskbar, Explorer and the installer. */
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];

/** ICNS entry types, keyed by the pixel size each one holds. */
const ICNS_TYPES = { 128: "ic07", 256: "ic08", 512: "ic09", 1024: "ic10" };

const PNG_TARGETS = [
  { path: ["apps", "web", "public", "favicon-16x16.png"], size: 16 },
  { path: ["apps", "web", "public", "favicon-32x32.png"], size: 32 },
  { path: ["apps", "web", "public", "apple-touch-icon.png"], size: 180 },
  { path: ["apps", "desktop", "resources", "icon.png"], size: 512 },
];

const ICO_TARGETS = [
  ["apps", "web", "public", "favicon.ico"],
  ["apps", "desktop", "resources", "icon.ico"],
];

/** The source SVG declares width="1024", so density 72 renders exactly 1024px. */
const SVG_NOMINAL_SIZE = 1024;
const BASE_DENSITY = 72;

async function renderPng(svg, size) {
  // Small icons are rendered oversized from the vector and then downsampled, so
  // the 68px-wide strokes land on a pixel grid with antialiasing rather than
  // being rasterized directly at 16px, where they would break up. Larger sizes
  // come straight off the vector at their final size.
  const renderSize = size <= 64 ? size * 8 : size;
  return sharp(svg, { density: (BASE_DENSITY * renderSize) / SVG_NOMINAL_SIZE })
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
}

/**
 * Build an ICO from already-rendered PNGs.
 *
 * Entries are stored as PNG rather than BMP: it is legal in the format, every
 * Windows since Vista reads it, and it avoids hand-rolling the DIB masks that
 * BMP entries need.
 */
function buildIco(images) {
  const header = NodeBuffer.Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type 1 = icon
  header.writeUInt16LE(images.length, 4);

  const directory = NodeBuffer.Buffer.alloc(16 * images.length);
  let offset = header.length + directory.length;

  images.forEach(({ size, data }, index) => {
    const entry = index * 16;
    // 256 is stored as 0; the width and height fields are a single byte each.
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 0);
    directory.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    directory.writeUInt16LE(1, entry + 4); // colour planes
    directory.writeUInt16LE(32, entry + 6); // bits per pixel
    directory.writeUInt32LE(data.length, entry + 8);
    directory.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });

  return NodeBuffer.Buffer.concat([header, directory, ...images.map((image) => image.data)]);
}

/** Build an ICNS: a magic, a total length, then one length-prefixed PNG per type. */
function buildIcns(images) {
  const chunks = images.map(({ size, data }) => {
    const chunkHeader = NodeBuffer.Buffer.alloc(8);
    chunkHeader.write(ICNS_TYPES[size], 0, 4, "ascii");
    chunkHeader.writeUInt32BE(data.length + 8, 4);
    return NodeBuffer.Buffer.concat([chunkHeader, data]);
  });

  const total = 8 + chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const fileHeader = NodeBuffer.Buffer.alloc(8);
  fileHeader.write("icns", 0, 4, "ascii");
  fileHeader.writeUInt32BE(total, 4);
  return NodeBuffer.Buffer.concat([fileHeader, ...chunks]);
}

const svg = await NodeFSP.readFile(sourceSvgPath);

for (const target of PNG_TARGETS) {
  await NodeFSP.writeFile(
    NodePath.join(repoRoot, ...target.path),
    await renderPng(svg, target.size),
  );
  console.log(`${target.size}x${target.size}\t${target.path.join("/")}`);
}

const ico = buildIco(
  await Promise.all(ICO_SIZES.map(async (size) => ({ size, data: await renderPng(svg, size) }))),
);
for (const target of ICO_TARGETS) {
  await NodeFSP.writeFile(NodePath.join(repoRoot, ...target), ico);
  console.log(`${ICO_SIZES.join(",")}\t${target.join("/")}`);
}

const icnsSizes = Object.keys(ICNS_TYPES).map(Number);
const icns = buildIcns(
  await Promise.all(icnsSizes.map(async (size) => ({ size, data: await renderPng(svg, size) }))),
);
const icnsTarget = ["apps", "desktop", "resources", "icon.icns"];
await NodeFSP.writeFile(NodePath.join(repoRoot, ...icnsTarget), icns);
console.log(`${icnsSizes.join(",")}\t${icnsTarget.join("/")}`);
