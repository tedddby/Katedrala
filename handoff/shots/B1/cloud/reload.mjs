// Reload at a scroll position: what the navigation and the layout show from the first frames on (no flash of the
// wrong layout). Records per animation frame: time, scrollY, data-kfilm, data-kfilm-under, the nav's background.
// usage: node reload.mjs <W>x<H> <where: px | "end" | P of the track> [--reduced]
import { chromium } from "playwright-core";
const [size = "1440x900", where = "end", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const reduced = rest.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width, height }, reducedMotion: reduced ? "reduce" : "no-preference" });
const page = await context.newPage();
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForTimeout(2500);
await page.evaluate((where) => {
  const track = document.querySelector("[data-film-track]");
  const top = track.getBoundingClientRect().top + scrollY;
  let y;
  if (where === "end") y = document.documentElement.scrollHeight;
  else if (Number(where) <= 1) y = top + Number(where) * (track.offsetHeight - innerHeight);
  else y = Number(where);
  window.scrollTo({ top: y, behavior: "instant" });
}, where);
await page.waitForTimeout(800);
const before = await page.evaluate(() => scrollY);
await page.addInitScript(() => {
  const log = [];
  window.__frames = log;
  const t0 = performance.now();
  const step = () => {
    const nav = document.querySelector(".site-nav");
    const html = document.documentElement;
    log.push([Math.round(performance.now() - t0), Math.round(scrollY), html.dataset.kfilm ?? "-", html.dataset.kfilmUnder !== undefined ? "under" : "-", nav ? getComputedStyle(nav).backgroundColor : "no nav"]);
    if (performance.now() - t0 < 3000) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
});
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(3500);
const frames = await page.evaluate(() => window.__frames);
// Collapse runs of identical states.
const runs = [];
for (const f of frames) {
  const key = f.slice(1).join(" ");
  if (runs.length === 0 || runs[runs.length - 1].key !== key) runs.push({ key, from: f[0] });
}
console.log(`reload at scrollY ${before} (${where}), ${size}${reduced ? " reduced" : ""}`);
for (const r of runs) console.log(`  from ${r.from} ms: scrollY ${r.key}`);
await browser.close();
