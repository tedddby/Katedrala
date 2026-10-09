// Replaces the chain vertex shader main() to test attribute bindings.
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
  ["attrs", "gl_Position = vec4(aT * 1.6 - 0.8, aSide * 0.3 + (iEnds.x / 404.0) * 0.5, 0.0, 1.0); vSide = 0.0; vHalf = 1.0; vAlpha = 1.0; vBlue = 0.0;"],
  ["ends", "vec4 A = node(iEnds.x); vec4 B = node(iEnds.y); vec3 P = mix(B.xyz, A.xyz, aT); vec4 c = projectionMatrix * modelViewMatrix * vec4(P, 1.0); c.y += aSide * 0.004 * c.w; gl_Position = c; vSide = 0.0; vHalf = 1.0; vAlpha = 1.0; vBlue = 0.0;"],
];
for (const [name, body] of tests) {
  await page.evaluate((body) => {
    const s = window.__kfilm.stage;
    const meshes = [];
    s.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
    const m = meshes[1].material;
    if (!window.__origV) window.__origV = m.vertexShader;
    m.vertexShader = window.__origV.replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() { ${body} }\n`);
    m.fragmentShader = m.fragmentShader.replace(/void main\(\) \{[\s\S]*\}\s*$/, `void main() { outColor = vec4(1.0, 0.0, 0.0, 1.0); }\n`);
    m.needsUpdate = true;
    s.dirty = true;
    window.__kfilm.wake();
  }, body);
  await page.waitForTimeout(700);
  await page.screenshot({ path: `/katedrala/handoff/lab/cinematic/iter3/probe-v-${name}.png` });
  console.log("shot", name);
}
await browser.close();
