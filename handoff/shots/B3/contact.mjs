// Contact sheet of PNGs (box-downscaled by an integer factor), laid out in rows, for a visual check of captures.
// Also reports, per image, the longest run of rows that are a single flat color (a blank band).
// Usage: node contact.mjs <out.png> <factor> <columns> <img1.png> [img2.png ...]
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { PNG } from "pngjs";

const [out, factorArg, colsArg, ...files] = process.argv.slice(2);
const factor = Number(factorArg);
const cols = Number(colsArg);
const GAP = 16;
const LABEL = 0;

function downscale(png, f) {
  const w = Math.max(1, Math.floor(png.width / f));
  const h = Math.max(1, Math.floor(png.height / f));
  const o = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      let r = 0, g = 0, b = 0, n = 0;
      for (let dy = 0; dy < f; dy += 1) {
        for (let dx = 0; dx < f; dx += 1) {
          const i = ((y * f + dy) * png.width + (x * f + dx)) * 4;
          r += png.data[i]; g += png.data[i + 1]; b += png.data[i + 2]; n += 1;
        }
      }
      const j = (y * w + x) * 4;
      o.data[j] = r / n; o.data[j + 1] = g / n; o.data[j + 2] = b / n; o.data[j + 3] = 255;
    }
  }
  return o;
}

function longestFlatRun(png) {
  let best = 0, run = 0, bestAt = 0;
  for (let y = 0; y < png.height; y += 1) {
    const i0 = y * png.width * 4;
    const r0 = png.data[i0], g0 = png.data[i0 + 1], b0 = png.data[i0 + 2];
    let flat = true;
    for (let x = 0; x < png.width; x += 3) {
      const i = i0 + x * 4;
      if (Math.abs(png.data[i] - r0) + Math.abs(png.data[i + 1] - g0) + Math.abs(png.data[i + 2] - b0) > 6) { flat = false; break; }
    }
    run = flat ? run + 1 : 0;
    if (run > best) { best = run; bestAt = y - run + 1; }
  }
  return { rows: best, from: bestAt };
}

const tiles = files.map((f) => {
  const png = PNG.sync.read(readFileSync(f));
  const flat = longestFlatRun(png);
  console.log(`${basename(f)}: ${png.width}x${png.height}, longest flat band ${flat.rows} rows at y ${flat.from} (${Math.round((flat.rows / png.height) * 100)}%)`);
  return downscale(png, factor);
});
const rows = [];
for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
const width = Math.max(...rows.map((r) => r.reduce((s, t) => s + t.width + GAP, GAP)));
const height = rows.reduce((s, r) => s + Math.max(...r.map((t) => t.height)) + GAP + LABEL, GAP);
const sheet = new PNG({ width, height });
for (let i = 0; i < sheet.data.length; i += 4) { sheet.data[i] = 120; sheet.data[i + 1] = 40; sheet.data[i + 2] = 120; sheet.data[i + 3] = 255; }
let y = GAP;
for (const r of rows) {
  let x = GAP;
  for (const t of r) { PNG.bitblt(t, sheet, 0, 0, t.width, t.height, x, y); x += t.width + GAP; }
  y += Math.max(...r.map((t) => t.height)) + GAP + LABEL;
}
writeFileSync(out, PNG.sync.write(sheet));
console.log(`sheet ${width}x${height} -> ${out}`);
