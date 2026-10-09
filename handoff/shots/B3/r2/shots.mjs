// Viewport captures of the draft page at chosen places: "hinge" (the plate's top under the bar), "handoff" (the
// film's last pinned frame leaving), a section id, or a film progress 0..1. Film mode unless --reduced.
// usage: node shots.mjs <outDir> <W>x<H> <place,place,...> [--url=...] [--reduced] [--touch] [--full=<id>]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [out, size, places, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const opt = (k, d) => (rest.find((a) => a.startsWith(`--${k}=`)) ?? `--${k}=${d}`).slice(k.length + 3);
const url = opt("url", "http://localhost:3100/lab/promoted/");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const touch = flag("--touch") || width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
await page.goto(url, { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
await page.waitForTimeout(2500);
for (const place of places.split(",")) {
  await page.evaluate((place) => {
    const track = document.querySelector("[data-film-track]");
    const top = track.getBoundingClientRect().top + scrollY;
    const span = track.offsetHeight - innerHeight;
    let y;
    if (place === "handoff") y = top + track.offsetHeight - innerHeight * 0.55;
    else if (/^[0-9.]+$/.test(place)) y = top + Number(place) * span;
    else {
      const el = document.getElementById(place);
      y = el.getBoundingClientRect().top + scrollY - (place === "how-it-works" ? 0 : 64);
    }
    window.scrollTo({ top: y, behavior: "instant" });
  }, place);
  await page.waitForTimeout(2200);
  await page.screenshot({ path: `${out}/${size}-${place}.png` });
}
const full = opt("full", "");
if (full) {
  const el = page.locator(`#${full}`);
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await el.screenshot({ path: `${out}/${size}-full-${full}.png` });
}
await browser.close();
