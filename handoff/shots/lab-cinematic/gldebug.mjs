// Hooks WebGL draw calls and shader logs on the cinematic route to find why chains do not show.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const P = WebGL2RenderingContext.prototype;
  window.__draws = [];
  window.__logs = [];
  const dei = P.drawElementsInstanced;
  P.drawElementsInstanced = function (mode, count, type, offset, inst) {
    window.__draws.push(["dei", mode, count, inst]);
    return dei.apply(this, arguments);
  };
  const de = P.drawElements;
  P.drawElements = function (mode, count, type, offset) {
    window.__draws.push(["de", mode, count]);
    return de.apply(this, arguments);
  };
  const sil = P.getShaderInfoLog;
  P.getShaderInfoLog = function (s) {
    const r = sil.apply(this, arguments);
    if (r) window.__logs.push("shader: " + r);
    return r;
  };
  const pil = P.getProgramInfoLog;
  P.getProgramInfoLog = function (p) {
    const r = pil.apply(this, arguments);
    if (r) window.__logs.push("program: " + r);
    return r;
  };
});
page.on("console", (m) => console.log("console", m.type(), m.text().slice(0, 400)));
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: "instant" });
}, 0.3);
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  window.__draws = [];
  return new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(() => res({ draws: window.__draws.slice(0, 20), logs: window.__logs }))));
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
