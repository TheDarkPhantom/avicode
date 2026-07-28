import * as NodeFS from "node:fs/promises";
import * as NodePath from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const repoRoot = NodePath.resolve(NodePath.dirname(fileURLToPath(import.meta.url)), "../..");
const source = NodePath.join(repoRoot, "assets/prod/logo.svg");
const sizes = [16, 24, 32, 48, 64, 128, 180, 256, 512, 1024];

function encodePngIco(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, contents }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size === 256 ? 0 : size, entry);
    header.writeUInt8(size === 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(contents.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += contents.length;
  });
  return Buffer.concat([header, ...images.map(({ contents }) => contents)]);
}

const pngs = new Map();
for (const size of sizes) {
  pngs.set(size, await sharp(source).resize(size, size).png().toBuffer());
}

const outputs = new Map([
  ["assets/prod/black-ios-1024.png", pngs.get(1024)],
  ["assets/prod/black-macos-1024.png", pngs.get(1024)],
  ["assets/prod/black-universal-1024.png", pngs.get(1024)],
  ["assets/prod/t3-black-web-apple-touch-180.png", pngs.get(180)],
  ["assets/prod/t3-black-web-favicon-16x16.png", pngs.get(16)],
  ["assets/prod/t3-black-web-favicon-32x32.png", pngs.get(32)],
]);
const ico = encodePngIco(
  [16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, contents: pngs.get(size) })),
);
outputs.set("assets/prod/t3-black-web-favicon.ico", ico);
outputs.set("assets/prod/t3-black-windows.ico", ico);

for (const [relativePath, contents] of outputs) {
  await NodeFS.writeFile(NodePath.join(repoRoot, relativePath), contents);
}

console.log(`Updated ${outputs.size} AviCode brand assets.`);
