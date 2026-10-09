// Counts strongly red pixels in PNGs (to compare shader variants without viewing each).
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
for (const f of process.argv.slice(2)) {
  const png = PNG.sync.read(readFileSync(f));
  let red = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 150 && png.data[i + 1] < 80 && png.data[i + 2] < 80) red++;
  console.log(f.split("/").pop(), red);
}
