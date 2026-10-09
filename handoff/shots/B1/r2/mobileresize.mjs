// An address bar showing and hiding on a phone (a height-only resize of about 8 percent): ScrollTrigger must not
// measure the track again (ignoreMobileResize), the film stays on its beat. Then a width change (rotation) does.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(2500);
await page.evaluate(() => {
  const f = window.__kfilm;
  window.__refreshes = 0;
  f.scrollClock.addEventListener("refresh", () => window.__refreshes++);
  const tr = f.trigger;
  window.scrollTo({ top: tr.start + 0.4 * (tr.end - tr.start), behavior: "instant" });
});
await page.waitForTimeout(1500);
const state = () => page.evaluate(() => ({ isTouch: window.__kfilm.scrollClock.isTouch, refreshes: window.__refreshes, pos: `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}`, y: Math.round(scrollY), framing: window.__kfilm.framing }));
const before = await state();
await page.setViewportSize({ width: 390, height: 776 });
await page.waitForTimeout(1200);
const shorter = await state();
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1200);
const back = await state();
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(2000);
const rotated = await state();
console.log(JSON.stringify({ before, shorter, back, rotated }, null, 1));
await browser.close();
