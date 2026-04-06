/**
 * Generates favicon PNGs, favicon.ico, og-image.png from **public/logo.png** (preferred) or public/favicon.svg.
 * **public/logo.png** is the official brand mark for SEO (JSON-LD) — replace that file to refresh all icons.
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

/** Deep navy to match brand mark padding when using contain-fit */
const NAVY = { r: 8, g: 20, b: 45, alpha: 1 };

async function writeFaviconSvgFromLogo() {
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 512 512">
  <image width="512" height="512" xlink:href="/logo.png" href="/logo.png" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
  fs.writeFileSync(path.join(pub, "favicon.svg"), svg.trim() + "\n");
}

async function main() {
  const logoPath = path.join(pub, "logo.png");
  const faviconSvgPath = path.join(pub, "favicon.svg");

  let sourceBuffer;
  let fromLogo = false;
  if (fs.existsSync(logoPath)) {
    let buf = fs.readFileSync(logoPath);
    const meta = await sharp(buf).metadata();
    if (meta.format && meta.format !== "png") {
      buf = await sharp(buf).png({ compressionLevel: 9 }).toBuffer();
      fs.writeFileSync(logoPath, buf);
    }
    sourceBuffer = buf;
    fromLogo = true;
  } else if (fs.existsSync(faviconSvgPath)) {
    sourceBuffer = fs.readFileSync(faviconSvgPath);
    fromLogo = false;
  } else {
    console.error("Missing public/logo.png (or fallback public/favicon.svg)");
    process.exit(1);
  }

  const toSquarePng = (size) =>
    fromLogo
      ? sharp(sourceBuffer)
          .resize(size, size, { fit: "contain", background: NAVY })
          .png()
      : sharp(sourceBuffer).resize(size, size).png();

  await toSquarePng(32).toFile(path.join(pub, "favicon-32x32.png"));
  await toSquarePng(16).toFile(path.join(pub, "favicon-16x16.png"));
  await toSquarePng(180).toFile(path.join(pub, "apple-touch-icon.png"));
  await toSquarePng(32).toFile(path.join(pub, "favicon.png"));
  await toSquarePng(192).toFile(path.join(pub, "pwa-192.png"));
  await toSquarePng(512).toFile(path.join(pub, "pwa-512.png"));

  const png32 = fs.readFileSync(path.join(pub, "favicon-32x32.png"));
  const png16 = fs.readFileSync(path.join(pub, "favicon-16x16.png"));
  const icoBuf = await pngToIco([png16, png32]);
  fs.writeFileSync(path.join(pub, "favicon.ico"), icoBuf);

  if (fromLogo) {
    await writeFaviconSvgFromLogo();
    const logoInner = await sharp(sourceBuffer)
      .resize(520, 520, { fit: "inside", withoutEnlargement: true })
      .toBuffer();
    await sharp({
      create: {
        width: 1200,
        height: 630,
        channels: 3,
        background: { r: NAVY.r, g: NAVY.g, b: NAVY.b },
      },
    })
      .composite([{ input: logoInner, gravity: "center" }])
      .png()
      .toFile(path.join(pub, "og-image.png"));
    console.log("Wrote og-image.png from logo.png");
  } else {
    const ogSvg = path.join(pub, "og-image.svg");
    if (fs.existsSync(ogSvg)) {
      await sharp(fs.readFileSync(ogSvg)).resize(1200, 630).png().toFile(path.join(pub, "og-image.png"));
      console.log("Wrote og-image.png from og-image.svg");
    } else {
      console.warn("Skipping og-image.png (no logo.png and no og-image.svg)");
    }
  }

  console.log("Favicon assets written to public/");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
