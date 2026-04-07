/**
 * Removes a solid/near-white outer background by flooding from image edges.
 * Preserves white artwork inside closed shapes (e.g. PH on navy shield).
 * Usage: node scripts/make-transparent-logo.mjs <input.png> <output.png>
 */
import fs from "fs";

function parseArgs() {
  const input = process.argv[2];
  const output = process.argv[3];
  if (!input || !output) {
    console.error("Usage: node scripts/make-transparent-logo.mjs <input.png> <output.png>");
    process.exit(1);
  }
  return { input, output };
}

async function main() {
  const { default: sharp } = await import("sharp");
  const { input, output } = parseArgs();

  const { data, info } = await sharp(input)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width: w, height: h, channels } = info;
  if (channels !== 4) throw new Error("Expected RGBA");

  const avg = (i) => (data[i] + data[i + 1] + data[i + 2]) / 3;
  const spread = (i) => {
    const r = data[i],
      g = data[i + 1],
      b = data[i + 2];
    return Math.max(r, g, b) - Math.min(r, g);
  };

  /** Pixels similar to the white / light-gray backdrop only (not saturated blues). */
  const isBackdrop = (i) => avg(i) >= 248 && spread(i) <= 28;

  const seen = new Uint8Array(w * h);
  const q = [];
  const push = (x, y) => {
    const idx = y * w + x;
    if (seen[idx]) return;
    const di = idx * 4;
    if (!isBackdrop(di)) return;
    seen[idx] = 1;
    q.push(idx);
  };

  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }

  while (q.length) {
    const idx = q.pop();
    const x = idx % w;
    const y = (idx / w) | 0;
    const neigh = [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ];
    for (const [nx, ny] of neigh) {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      push(nx, ny);
    }
  }

  for (let i = 0; i < w * h; i++) {
    if (!seen[i]) continue;
    data[i * 4 + 3] = 0;
  }

  await sharp(Buffer.from(data), {
    raw: { width: w, height: h, channels: 4 },
  })
    .png()
    .toFile(output);

  console.log("Wrote", output);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
