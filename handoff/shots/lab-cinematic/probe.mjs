// Probes the live Film object (dev hook window.__kfilm) at a given progress.
import { chromium } from "playwright-core";
const p = Number(process.argv[2] ?? 0.3);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("console", (m) => { if (m.type() === "error") console.log("console", m.type(), m.text().slice(0, 300)); });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, p);
await page.waitForTimeout(2500);
const out = await page.evaluate(() => {
  const f = window.__kfilm;
  const s = f.stage;
  const meshes = [];
  s.scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const chain = meshes[1];
  const u = chain.material.uniforms;
  const pick = (k) => { const v = u[k].value; return v && v.isVector2 ? [v.x, v.y] : v && v.isVector3 ? [v.x, v.y, v.z] : v && v.isTexture ? "tex" : v; };
  const keys = Object.keys(u);
  const info = chain.geometry.attributes.iInfo.array;
  const ends = chain.geometry.attributes.iEnds.array;
  const pos = s.sim.pos;
  const sample = [];
  for (let k = 0; k < 5; k++) {
    const a = ends[k * 2], b = ends[k * 2 + 1];
    sample.push({ k, a, b, info: Array.from(info.slice(k * 4, k * 4 + 4)), A: Array.from(pos.slice(a * 4, a * 4 + 4)), B: Array.from(pos.slice(b * 4, b * 4 + 4)) });
  }
  return {
    p: f.p, keys: keys.map((k) => [k, pick(k)]), sample,
    sameUniform: chain.material.uniforms.uViewport === meshes[3].material.uniforms.uViewport,
    attrs: Object.keys(chain.geometry.attributes), count: chain.geometry.index.count, inst: chain.geometry.instanceCount,
    renderInfo: s.renderer.info.render,
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
