// Hovers (desktop) or taps (phone) one real file on the stage at a given progress and captures the load path.
// usage: node hover.mjs <out.png> <W>x<H> <p> <file path> [--tap] [--reduced] [--nowebgl]
import { chromium } from "playwright-core";
const [out, size, pArg, file, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const p = Number(pArg);
const tap = rest.includes("--tap");
const args = rest.includes("--nowebgl") ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const mobile = width < 600;
const page = await browser.newPage({
  viewport: { width, height },
  deviceScaleFactor: mobile ? 3 : 1,
  isMobile: mobile,
  hasTouch: mobile,
  reducedMotion: rest.includes("--reduced") ? "reduce" : "no-preference",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForSelector("[data-ready]", { timeout: 30000 });
await page.waitForTimeout(1500);
await page.evaluate((p) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + window.scrollY;
  const span = Math.max(0, track.offsetHeight - window.innerHeight);
  window.scrollTo({ top: top + p * span, behavior: "instant" });
}, p);
await page.waitForTimeout(2200);
const at = await page.evaluate((file) => {
  const film = window.__kfilm;
  const v = film.model.paths.indexOf(file);
  const stage = document.querySelector("[data-film-stage]").getBoundingClientRect();
  let pt = null;
  if (film.stage) {
    const q = { x: 0, y: 0, depth: 0, visible: false };
    film.stage.screenOf(v, q);
    pt = q.visible ? q : null;
  } else if (film.fallback) {
    pt = film.fallback.screenOf(v);
  }
  return pt === null ? null : { x: stage.left + pt.x, y: stage.top + pt.y, v };
}, file);
if (at === null) {
  console.log("file not on screen", file);
} else {
  if (tap) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.move(at.x, at.y, { steps: 6 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: out });
  const readout = await page.evaluate(() => document.querySelector("[data-film-readout]")?.textContent ?? "");
  console.log("wrote", out, JSON.stringify(at), readout);
}
console.log(errors.length ? errors.join("\n") : "no page errors");
await browser.close();
