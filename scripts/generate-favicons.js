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

/** Self-contained SVG favicon (embedded PNG). External /logo.png refs are unreliable in browser favicon sandboxes. */
function writeFaviconSvgFromPng32(png32Buffer) {
  const b64 = png32Buffer.toString("base64");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <image width="32" height="32" href="data:image/png;base64,${b64}"/>
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

  await sharp(sourceBuffer).resize(32, 32).png().toFile(path.join(pub, "favicon-32x32.png"));
  writeFaviconSvgFromPng32(fs.readFileSync(path.join(pub, "favicon-32x32.png")));
  await sharp(sourceBuffer).resize(16, 16).png().toFile(path.join(pub, "favicon-16x16.png"));
  await sharp(sourceBuffer).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));

  const png32 = fs.readFileSync(path.join(pub, "favicon-32x32.png"));
  const png16 = fs.readFileSync(path.join(pub, "favicon-16x16.png"));
  const icoBuf = await pngToIco([png16, png32]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);

  await sharp(sourceBuffer).resize(32, 32).png().toFile(path.join(pub, "favicon.png"));

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
