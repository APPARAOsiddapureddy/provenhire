/**
 * Generates favicon PNGs, favicon.ico, og-image.png from **public/logo.png** (preferred) or public/favicon.svg.
 * **public/logo.png** is the official brand mark (transparent RGBA) — replace that file to refresh all icons.
 * Run from repo root: npm run generate:favicons
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pub = path.join(root, "public");

/** Self-contained SVG favicon (embedded PNG). Use a larger raster so tabs/bookmarks scale down sharply. */
function writeFaviconSvgEmbedded(pngBuffer, size) {
  const b64 = pngBuffer.toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <image width="${size}" height="${size}" href="data:image/png;base64,${b64}"/>
</svg>`;
  fs.writeFileSync(path.join(pub, "favicon.svg"), svg.trim() + "\n");
}

async function main() {
  const logoPath = path.join(pub, "logo.png");
  const legacySvgPath = path.join(pub, "favicon.svg");

  let sourceBuffer;
  if (fs.existsSync(logoPath)) {
    sourceBuffer = fs.readFileSync(logoPath);
  } else if (fs.existsSync(legacySvgPath)) {
    sourceBuffer = fs.readFileSync(legacySvgPath);
  } else {
    console.error("Missing public/logo.png (or fallback public/favicon.svg)");
    process.exit(1);
  }

  // Drop empty transparency so the glyph uses the full square (tabs stay the same size but the mark reads larger).
  let markBase = sourceBuffer;
  try {
    const trimmed = await sharp(sourceBuffer).trim().png().toBuffer();
    if (trimmed.length > 0) markBase = trimmed;
  } catch {
    /* keep original */
  }

  /** Fill the square (center crop): mark reads much larger in tabs than `contain` with letterboxing. */
  const fitMark = (n) =>
    sharp(markBase)
      .resize(n, n, { fit: "cover", position: "centre" })
      .png();

  const png1024 = await fitMark(1024).toBuffer();
  const png512 = await fitMark(512).toBuffer();
  const png256 = await fitMark(256).toBuffer();
  const png192 = await fitMark(192).toBuffer();
  const png128 = await fitMark(128).toBuffer();
  const png64 = await fitMark(64).toBuffer();
  const png48 = await fitMark(48).toBuffer();
  const png32 = await fitMark(32).toBuffer();
  const png16 = await fitMark(16).toBuffer();

  // 1024px raster in SVG — sharpest scaling in browsers that use SVG favicons.
  writeFaviconSvgEmbedded(png1024, 1024);

  fs.writeFileSync(path.join(pub, "favicon-16x16.png"), png16);
  fs.writeFileSync(path.join(pub, "favicon-32x32.png"), png32);
  fs.writeFileSync(path.join(pub, "favicon-48x48.png"), png48);
  fs.writeFileSync(path.join(pub, "favicon-64x64.png"), png64);
  fs.writeFileSync(path.join(pub, "favicon-128x128.png"), png128);
  fs.writeFileSync(path.join(pub, "favicon-192x192.png"), png192);
  fs.writeFileSync(path.join(pub, "favicon-256x256.png"), png256);
  fs.writeFileSync(path.join(pub, "favicon-512x512.png"), png512);
  fs.writeFileSync(path.join(pub, "favicon-1024x1024.png"), png1024);
  fs.writeFileSync(path.join(pub, "apple-touch-icon.png"), png1024);

  // ICO caps around 256px; omit 512 here to keep favicon.ico small (browsers use the PNG links for large sizes).
  const icoBuf = await pngToIco([png16, png32, png48, png64, png128, png256]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);

  fs.writeFileSync(path.join(pub, "favicon.png"), png512);

  const ogSvg = path.join(pub, "og-image.svg");
  if (fs.existsSync(ogSvg)) {
    await sharp(fs.readFileSync(ogSvg)).resize(1200, 630).png().toFile(path.join(pub, "og-image.png"));
    console.log("Wrote og-image.png from og-image.svg");
  } else {
    const navy = { r: 8, g: 20, b: 45, alpha: 1 };
    const inner = await sharp(sourceBuffer).resize(520, 520, { fit: "inside", withoutEnlargement: true }).toBuffer();
    await sharp({
      create: { width: 1200, height: 630, channels: 3, background: { r: navy.r, g: navy.g, b: navy.b } },
    })
      .composite([{ input: inner, gravity: "center" }])
      .png()
      .toFile(path.join(pub, "og-image.png"));
    console.log("Wrote og-image.png from logo.png (no og-image.svg)");
  }

  console.log("Favicon assets written to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
