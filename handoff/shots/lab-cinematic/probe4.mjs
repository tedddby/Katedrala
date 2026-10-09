// Bisects the chain vertex shader with targeted replacements.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console", m.type(), m.text().slice(0, 900)); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, 0.3);
await page.waitForTimeout(2000);
const tests = [
  ["v5-safediv", [["dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);", "dir = dir / max(length(dir), 1e-4);"]]],
  ["v6-flipcheck", [["if (dt < 0.0) dir = -dir;", "dir *= sign(dt);"], ["dir = length(dir) > 1e-6 ? normalize(dir) : vec2(1.0, 0.0);", "dir = dir / max(length(dir), 1e-4);"]]],
  ["v7-noflip", [["if (dt < 0.0) dir = -dir;", ""]]],




];
for (const [name, reps] of tests) {
  const res = await page.evaluate((reps) => {
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
    m.needsUpdate = true;
    s.dirty = true;
    window.__kfilm.wake();
    return n;
  }, reps);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `/katedrala/handoff/lab/cinematic/iter3/probe-b-${name}.png`, clip: { x: 250, y: 60, width: 1000, height: 700 } });
  console.log("shot", name, "replacements", res);
}
await browser.close();
