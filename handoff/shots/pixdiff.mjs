// Compares same-named PNGs in two folders; prints the share of differing pixels per file.
import { readdirSync, readFileSync } from "node:fs";
import { PNG } from "pngjs";
const [a, b] = process.argv.slice(2);
let worst = 0;
for (const f of readdirSync(a).filter((f) => f.endsWith(".png") && !f.startsWith("check-"))) {
  let x, y;
  try { x = PNG.sync.read(readFileSync(`${a}/${f}`)); y = PNG.sync.read(readFileSync(`${b}/${f}`)); } catch { console.log(`${f}: missing`); continue; }
  if (x.width !== y.width || x.height !== y.height) { console.log(`${f}: size ${x.width}x${x.height} vs ${y.width}x${y.height}`); worst = 1; continue; }
  let diff = 0;
  for (let i = 0; i < x.data.length; i += 4) if (Math.abs(x.data[i] - y.data[i]) + Math.abs(x.data[i + 1] - y.data[i + 1]) + Math.abs(x.data[i + 2] - y.data[i + 2]) > 24) diff++;
  const share = diff / (x.width * x.height);
  worst = Math.max(worst, share);
  if (share > 0) console.log(`${f}: ${(share * 100).toFixed(3)}% pixels differ`);
}
console.log(`worst ${(worst * 100).toFixed(3)}%`);
