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

// 全形式を同じシンボルから生成し、古い図柄や色の混在を防ぐ。
const symbol = await readFile(resolve(brandDir, "symbol.svg"), "utf8");
const artwork = symbol.slice(
  symbol.indexOf("<!-- artwork:start -->") + "<!-- artwork:start -->".length,
  symbol.indexOf("<!-- artwork:end -->"),
);
// 絵柄は白黒1色。暗い面では白で描く。
const ink = { light: "#000000", dark: "#FFFFFF" };
function art(theme) {
  return artwork.replaceAll('class="ink" fill="#000000"', `class="ink" fill="${ink[theme]}"`);
}
// ホーム画面のアイコンは kondo・uchiwake と同じく透過にし、黒い絵柄の外側に白い縁を付ける。
// iOS のダークモードなど暗い下地でも形が見えるようにするため。縁は太陽と丘のすき間も白で埋める。
const EDGE = 36;
function edge() {
  const group = artwork.slice(artwork.indexOf("<g transform"));
  return group
    .replace(/ mask="url\(#[^)]*\)"/g, "")
    .replaceAll(
      'class="ink" fill="#000000"',
      `class="edge" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="${EDGE}" stroke-linejoin="round"`,
    );
}
function appIcon() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <title>このごろ — 雲と丘</title>
${edge()}${art("light")}</svg>\n`;
}
function svg(background, scale = 1, adaptive = false, theme = "light") {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <title>このごろ — 雲と丘</title>
  ${adaptive ? "<style>@media (prefers-color-scheme: dark) { .background { fill: #000000; } .ink { fill: #FFFFFF; } }</style>" : ""}
  ${background ? `<rect class="background" width="1024" height="1024" fill="${background}"/>` : ""}
  <g transform="translate(${512 * (1 - scale)} ${512 * (1 - scale)}) scale(${scale})">
${art(theme)}  </g>
</svg>\n`.replace(/^[\t ]+$/gm, "");
}

await mkdir(iconDir, { recursive: true });
for (const [theme, background] of [
  ["light", "#FFFFFF"],
  ["dark", "#000000"],
]) {
  await writeFile(resolve(brandDir, `icon-master-${theme}.svg`), svg(background, 1, false, theme));
  await writeFile(resolve(brandDir, `logo-symbol-${theme}.svg`), svg(null, 1, false, theme));
}
await writeFile(resolve(iconDir, "icon.svg"), svg("#FFFFFF", 1, true));
await writeFile(resolve(brandDir, "icon-app.svg"), appIcon());
await writeFile(resolve(iconDir, "icon-maskable.svg"), svg("#FFFFFF", 0.8));

const sources = {
  light: resolve(brandDir, "icon-master-light.svg"),
  dark: resolve(brandDir, "icon-master-dark.svg"),
  lightTransparent: resolve(brandDir, "logo-symbol-light.svg"),
  darkTransparent: resolve(brandDir, "logo-symbol-dark.svg"),
  app: resolve(brandDir, "icon-app.svg"),
};

const exports = [
  [sources.light, resolve(iconDir, "icon-light-1024.png"), 1024],
  [sources.dark, resolve(iconDir, "icon-dark-1024.png"), 1024],
  [sources.light, resolve(iconDir, "icon-light-512.png"), 512],
  [sources.dark, resolve(iconDir, "icon-dark-512.png"), 512],
  [sources.light, resolve(iconDir, "icon-light-192.png"), 192],
  [sources.dark, resolve(iconDir, "icon-dark-192.png"), 192],
  [sources.app, resolve(iconDir, "apple-touch-icon.png"), 180],
  [sources.light, resolve(iconDir, "icon-light-167.png"), 167],
  [sources.light, resolve(iconDir, "icon-light-152.png"), 152],
  [sources.lightTransparent, resolve(iconDir, "icon-light-transparent.png"), 1024],
  [sources.darkTransparent, resolve(iconDir, "icon-dark-transparent.png"), 1024],
  [sources.light, resolve(publicDir, "favicon-32x32.png"), 32],
  [sources.light, resolve(publicDir, "favicon-16x16.png"), 16],
  [sources.app, resolve(publicDir, "android-chrome-192x192.png"), 192],
  [sources.app, resolve(publicDir, "android-chrome-512x512.png"), 512],
  [resolve(iconDir, "icon-maskable.svg"), resolve(iconDir, "icon-maskable-512.png"), 512],
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
