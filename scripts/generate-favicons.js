/**
 * Generates favicon PNGs, favicon.ico, og-image.png from public SVGs.
 * **public/logo.png** is the official brand mark for SEO (JSON-LD) — add/replace manually;
 * this script does not overwrite it.
 * Run from repo root: node scripts/generate-favicons.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import pngToIco from "png-to-ico";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const pub = path.join(root, "public");

async function main() {
  const faviconSvg = path.join(pub, "favicon.svg");
  const ogSvg = path.join(pub, "og-image.svg");

  if (!fs.existsSync(faviconSvg)) {
    console.error("Missing public/favicon.svg");
    process.exit(1);
  }

  const svgBuffer = fs.readFileSync(faviconSvg);

  await sharp(svgBuffer).resize(32, 32).png().toFile(path.join(pub, "favicon-32x32.png"));
  await sharp(svgBuffer).resize(16, 16).png().toFile(path.join(pub, "favicon-16x16.png"));
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(pub, "apple-touch-icon.png"));

  const png32 = fs.readFileSync(path.join(pub, "favicon-32x32.png"));
  const png16 = fs.readFileSync(path.join(pub, "favicon-16x16.png"));
  const icoBuf = await pngToIco([png16, png32]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);

  if (fs.existsSync(ogSvg)) {
    await sharp(fs.readFileSync(ogSvg)).resize(1200, 630).png().toFile(path.join(pub, "og-image.png"));
    console.log("Wrote og-image.png from og-image.svg");
  } else {
    console.warn("Skipping og-image.png (public/og-image.svg missing)");
  }

  console.log("Favicon assets written to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
