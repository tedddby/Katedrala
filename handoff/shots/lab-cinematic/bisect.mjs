// Runs many chain vertex-shader variants in one page load; prints the red pixel count for each.
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
import { readFileSync } from "node:fs";
const variants = JSON.parse(readFileSync(process.argv[2], "utf8"));
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.text().slice(0, 1500)); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, Number(process.argv[3] ?? 0.3));
await page.waitForTimeout(2000);
for (const [name, reps] of variants) {
  const n = await page.evaluate((reps) => {
    const s = window.__kfilm.stage;
    const meshes = [];
    s.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const m = meshes[1].material;
    if (!window.__origV) window.__origV = m.vertexShader;
    let v = window.__origV;
    let n = 0;
    for (const [a, b] of reps) { if (v.includes(a)) n++; v = v.replace(a, b); }
    m.vertexShader = v;
    m.fragmentShader = m.fragmentShader.replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }\n`);
    m.needsUpdate = true; s.dirty = true; window.__kfilm.wake();
    return n;
  }, reps);
  await page.waitForTimeout(700);
  const png = PNG.sync.read(await page.screenshot());
  let red = 0;
  for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 150 && png.data[i + 1] < 80 && png.data[i + 2] < 80) red++;
  console.log(name.padEnd(16), "reps", n, "/", reps.length, "red", red);
}
await browser.close();
