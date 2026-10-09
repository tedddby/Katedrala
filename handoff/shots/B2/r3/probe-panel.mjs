// Measures the landing panel's fit at a viewport, before and after choosing a file (by path) and a direction, and
// screenshots both. Usage: node r3/probe-panel.mjs <w>x<h> <mobile|desktop> [path] [up|down]
import { chromium } from "playwright-core";
const [size, mob, path, dir] = process.argv.slice(2);
const [w, h] = size.split("x").map(Number);
const mobile = mob === "mobile";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, deviceScaleFactor: 1 });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const f = window.__kfilm;
  const P = f.clock.progressOf(3, 0.4);
  window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" });
});
await page.waitForTimeout(2000);
const measure = () => page.evaluate(() => {
  const panel = document.querySelector("[data-ld-panel]");
  const pr = panel.getBoundingClientRect();
  const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return `${b.top.toFixed(0)}-${b.bottom.toFixed(0)}`; };
  const picks = [...document.querySelectorAll("[data-ld-pick]")].map((b) => { const r = b.getBoundingClientRect(); return `${r.left.toFixed(0)},${r.top.toFixed(0)} ${r.width.toFixed(0)}x${r.height.toFixed(0)}`; });
  return {
    panel: `x=${pr.left.toFixed(0)} y=${pr.top.toFixed(0)}-${pr.bottom.toFixed(0)} w=${pr.width.toFixed(0)} client=${panel.clientHeight} scroll=${panel.scrollHeight} scrollTop=${panel.scrollTop}`,
    title: box("[data-act-slot='trace'] h2"), toggle: box("[data-ld-legend-toggle]"), show: box("[data-ld-show]"), select: box("[data-ld-file]"),
    readout: box("[data-ld-readout]"), scope: box("[data-ld-scope]"), picks,
    readoutText: document.querySelector("[data-ld-readout]").textContent,
    pointer: matchMedia("(pointer: coarse)").matches ? "coarse" : "fine",
  };
});
console.log(JSON.stringify(await measure(), null, 1));
const tag = `${w}x${h}-${mob}`;
await page.screenshot({ path: `r3/panel-${tag}-0.png` });
if (path) {
  if (dir === "up") await page.click('[data-ld-show] label:has(input[value="up"])');
  await page.selectOption("[data-ld-file]", { label: path });
  await page.waitForTimeout(800);
  console.log(JSON.stringify(await measure(), null, 1));
  await page.screenshot({ path: `r3/panel-${tag}-1.png` });
}
await browser.close();
