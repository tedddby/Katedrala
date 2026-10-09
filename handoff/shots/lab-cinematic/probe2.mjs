// Patches the chain fragment shader at runtime to isolate the invisible-chain bug.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console", m.type(), m.text().slice(0, 600)); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, 0.3);
await page.waitForTimeout(2000);
for (const [name, body] of [
  ["solid", "outColor = vec4(1.0, 0.0, 0.0, 1.0);"],
  ["alpha", "outColor = vec4(vAlpha, 0.0, 0.0, 1.0);"],
  ["side", "outColor = vec4(abs(vSide), vHalf, 0.0, 1.0);"],
]) {
  await page.evaluate((body) => {
    const s = window.__kfilm.stage;
    const meshes = [];
    s.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const m = meshes[1].material;
    m.fragmentShader = m.fragmentShader.replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() { ${body} }\n`);
    m.needsUpdate = true;
    s.dirty = true;
    window.__kfilm.wake();
  }, body);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `/katedrala/handoff/lab/cinematic/iter3/probe-${name}.png` });
  console.log("shot", name);
}
await browser.close();
