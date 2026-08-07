import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const projectRoot = resolve(import.meta.dirname, "..");
const source = resolve(projectRoot, "public/brand/wzrd-logo-intro.png");
const outputDirectory = resolve(projectRoot, "public/brand");
const faviconPath = resolve(projectRoot, "public/favicon.ico");
const background = { r: 5, g: 7, b: 10, alpha: 1 };

// The supplied transparent wordmark places the W glyph inside this source box.
// Keeping the crop numeric makes every favicon and homescreen asset a faithful
// derivative of the original artwork rather than a newly drawn monogram.
const wGlyphCrop = { left: 55, top: 350, width: 415, height: 500 };

async function createIcon(size, artworkSize) {
  const glyph = await sharp(source)
    .extract(wGlyphCrop)
    .resize({
      width: artworkSize,
      height: artworkSize,
      fit: "inside",
      kernel: sharp.kernel.lanczos3,
    })
    .png()
    .toBuffer();

  return sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background,
    },
  })
    .composite([{ input: glyph, gravity: "centre" }])
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}

function pngIco(pngEntries) {
  const headerSize = 6;
  const entrySize = 16;
  const directory = Buffer.alloc(headerSize + entrySize * pngEntries.length);

  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(pngEntries.length, 4);

  let offset = directory.length;
  for (const [index, { size, buffer }] of pngEntries.entries()) {
    const entryOffset = headerSize + index * entrySize;
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset);
    directory.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);
    directory.writeUInt8(0, entryOffset + 2);
    directory.writeUInt8(0, entryOffset + 3);
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(32, entryOffset + 6);
    directory.writeUInt32LE(buffer.length, entryOffset + 8);
    directory.writeUInt32LE(offset, entryOffset + 12);
    offset += buffer.length;
  }

  return Buffer.concat([directory, ...pngEntries.map(({ buffer }) => buffer)]);
}

const standardSizes = [16, 32, 48, 180, 192, 512];
const icons = new Map();

await mkdir(outputDirectory, { recursive: true });

for (const size of standardSizes) {
  const artworkSize = Math.round(size * 0.8);
  const icon = await createIcon(size, artworkSize);
  icons.set(size, icon);
  await writeFile(resolve(outputDirectory, `wzrd-icon-${size}.png`), icon);
}

const maskableIcon = await createIcon(512, 352);
await writeFile(resolve(outputDirectory, "wzrd-icon-maskable-512.png"), maskableIcon);

await writeFile(
  faviconPath,
  pngIco(
    [16, 32, 48].map((size) => ({
      size,
      buffer: icons.get(size),
    }))
  )
);

console.log(`Generated WZRD icon family in ${dirname(outputDirectory)}`);
