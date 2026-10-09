import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
const [src, dst, y0, y1] = process.argv.slice(2);
const img = PNG.sync.read(readFileSync(src));
const top = Number(y0), bottom = Math.min(Number(y1), img.height);
const out = new PNG({ width: img.width, height: bottom - top });
PNG.bitblt(img, out, 0, top, img.width, bottom - top, 0, 0);
writeFileSync(dst, PNG.sync.write(out));
console.log(`${dst}: ${img.width}x${bottom - top} from ${img.height}`);
