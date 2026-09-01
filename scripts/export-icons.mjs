import { Buffer } from "node:buffer";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stdout } from "node:process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const brandDir = resolve(root, "assets/brand");
const publicDir = resolve(root, "public");
const iconDir = resolve(publicDir, "icons");

const sources = {
  light: resolve(brandDir, "icon-master-light.svg"),
  dark: resolve(brandDir, "icon-master-dark.svg"),
  lightTransparent: resolve(brandDir, "logo-symbol-light.svg"),
  darkTransparent: resolve(brandDir, "logo-symbol-dark.svg"),
};

const exports = [
  [sources.light, resolve(iconDir, "icon-light-1024.png"), 1024],
  [sources.dark, resolve(iconDir, "icon-dark-1024.png"), 1024],
  [sources.light, resolve(iconDir, "icon-light-512.png"), 512],
  [sources.dark, resolve(iconDir, "icon-dark-512.png"), 512],
  [sources.light, resolve(iconDir, "icon-light-192.png"), 192],
  [sources.dark, resolve(iconDir, "icon-dark-192.png"), 192],
  [sources.light, resolve(iconDir, "apple-touch-icon.png"), 180],
  [sources.light, resolve(iconDir, "icon-light-167.png"), 167],
  [sources.light, resolve(iconDir, "icon-light-152.png"), 152],
  [sources.lightTransparent, resolve(iconDir, "icon-light-transparent.png"), 1024],
  [sources.darkTransparent, resolve(iconDir, "icon-dark-transparent.png"), 1024],
  [sources.light, resolve(publicDir, "favicon-32x32.png"), 32],
  [sources.light, resolve(publicDir, "favicon-16x16.png"), 16],
  [sources.light, resolve(publicDir, "android-chrome-192x192.png"), 192],
  [sources.light, resolve(publicDir, "android-chrome-512x512.png"), 512],
];

await mkdir(iconDir, { recursive: true });

for (const [source, destination, size] of exports) {
  await sharp(source, { density: 384 })
    .resize(size, size)
    .png({ compressionLevel: 9, palette: false })
    .toFile(destination);
}

const faviconImages = await Promise.all([
  readFile(resolve(publicDir, "favicon-16x16.png")),
  readFile(resolve(publicDir, "favicon-32x32.png")),
]);

function createIco(images) {
  const headerSize = 6;
  const directorySize = images.length * 16;
  let imageOffset = headerSize + directorySize;
  const header = Buffer.alloc(headerSize + directorySize);

  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  for (const [index, image] of images.entries()) {
    const size = index === 0 ? 16 : 32;
    const entry = headerSize + index * 16;
    header.writeUInt8(size, entry);
    header.writeUInt8(size, entry + 1);
    header.writeUInt8(0, entry + 2);
    header.writeUInt8(0, entry + 3);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(image.length, entry + 8);
    header.writeUInt32LE(imageOffset, entry + 12);
    imageOffset += image.length;
  }

  return Buffer.concat([header, ...images]);
}

await writeFile(resolve(publicDir, "favicon.ico"), createIco(faviconImages));

stdout.write(`Exported ${exports.length} PNG files and favicon.ico\n`);
