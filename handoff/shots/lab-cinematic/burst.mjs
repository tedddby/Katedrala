// Scrolls with the mouse wheel like a user and captures frames on a fixed clock, to judge motion.
// usage: node burst.mjs <outDir> <W>x<H> <fromP> <toP> <pxPerSec> <frames> <everyMs> [--prefix name]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [outDir, size, fromP, toP, speed, frames, every, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const prefix = rest.includes("--prefix") ? rest[rest.indexOf("--prefix") + 1] : "burst";
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width, height } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" });
await page.waitForSelector("canvas[data-ready]", { timeout: 30000 });
const geo = await page.evaluate(() => {
  const track = document.querySelector("[data-film-track]");
  return { top: track.getBoundingClientRect().top + scrollY, span: track.offsetHeight - innerHeight };
});
await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), geo.top + Number(fromP) * geo.span);
await page.waitForTimeout(3200);
const target = geo.top + Number(toP) * geo.span;
// Wheel scrolling runs in the page so the capture clock is not blocked by it.
await page.evaluate(({ target, speed }) => {
  const start = performance.now();
  const y0 = scrollY;
  const step = () => {
    const y = Math.min(target, y0 + ((performance.now() - start) / 1000) * speed);
    window.scrollTo({ top: y, behavior: "instant" });
    if (y < target) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}, { target, speed: Number(speed) });
const t0 = Date.now();
for (let i = 0; i < Number(frames); i++) {
  const due = t0 + i * Number(every);
  const wait = due - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  const ms = Date.now() - t0;
  await page.screenshot({ path: `${outDir}/${prefix}-${String(i).padStart(2, "0")}-${String(ms).padStart(5, "0")}ms.png` });
}
console.log("done");
await browser.close();
