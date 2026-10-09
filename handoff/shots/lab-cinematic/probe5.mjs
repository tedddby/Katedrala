// Prints the served chain vertex shader and counts red pixels with a solid red fragment.
import { chromium } from "playwright-core";
import { PNG } from "pngjs";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, 0.3);
await page.waitForTimeout(2000);
const v = await page.evaluate(() => {
  const s = window.__kfilm.stage;
  const meshes = [];
  s.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const m = meshes[1].material;
  m.fragmentShader = m.fragmentShader.replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }\n`);
  m.needsUpdate = true; s.dirty = true; window.__kfilm.wake();
  return m.vertexShader.slice(m.vertexShader.indexOf("vec3 P = chainAt"), m.vertexShader.indexOf("vec2 nrm") + 40);
});
console.log(v);
await page.waitForTimeout(800);
const buf = await page.screenshot();
const png = PNG.sync.read(buf);
let red = 0;
for (let i = 0; i < png.data.length; i += 4) if (png.data[i] > 150 && png.data[i + 1] < 80 && png.data[i + 2] < 80) red++;
console.log("red", red);
await browser.close();
