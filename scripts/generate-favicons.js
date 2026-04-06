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

  const png192 = await sharp(sourceBuffer).resize(192, 192).png().toBuffer();
  const png64 = await sharp(sourceBuffer).resize(64, 64).png().toBuffer();
  const png48 = await sharp(sourceBuffer).resize(48, 48).png().toBuffer();
  const png32 = await sharp(sourceBuffer).resize(32, 32).png().toBuffer();
  const png16 = await sharp(sourceBuffer).resize(16, 16).png().toBuffer();

  // High-res raster inside SVG so the mark stays sharp when the browser scales it to ~16–32px in the tab.
  writeFaviconSvgEmbedded(png192, 192);

  fs.writeFileSync(path.join(pub, "favicon-16x16.png"), png16);
  fs.writeFileSync(path.join(pub, "favicon-32x32.png"), png32);
  fs.writeFileSync(path.join(pub, "favicon-48x48.png"), png48);
  fs.writeFileSync(path.join(pub, "favicon-64x64.png"), png64);
  fs.writeFileSync(path.join(pub, "favicon-192x192.png"), png192);
  fs.writeFileSync(path.join(pub, "apple-touch-icon.png"), png192);

  const icoBuf = await pngToIco([png16, png32, png48, png64, png192]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);

  fs.writeFileSync(path.join(pub, "favicon.png"), png64);

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
