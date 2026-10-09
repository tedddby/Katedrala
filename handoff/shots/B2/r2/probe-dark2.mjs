import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
const go = async (t) => { await page.evaluate((t) => { const f = window.__kfilm; const P = f.clock.progressOf(1, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, t); await page.waitForTimeout(3000); };
await go(0.76);
const variants = [
  ["notransform", "transform:none!important;transition:none!important"],
  ["noopacity", "opacity:1!important;transition:none!important;transform:none!important"],
  ["isolate", "isolation:isolate"],
];
let i = 0;
for (const [name, css] of variants) {
  await page.evaluate((css) => { const r = document.querySelector("[data-ev-record]"); r.setAttribute("style", css); window.__kfilm.relayout = true; window.__kfilm.wake(); }, css);
  await page.mouse.move(20 + i++, 20);
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `r2/cap2/dark-${name}.png`, clip: { x: 800, y: 560, width: 640, height: 340 } });
}
// Which layers? Inspect the figure's computed styles.
console.log(await page.evaluate(() => { const r = document.querySelector("[data-ev-record]"); const cs = getComputedStyle(r); const f = r.querySelector("figure"); const fs = getComputedStyle(f); const pre = r.querySelector("pre"); const ps = getComputedStyle(pre); return { pos: cs.position, z: cs.zIndex, bg: fs.backgroundColor, preMask: ps.maskImage, preOverflow: pre.dataset.overflow, rect: JSON.stringify(r.getBoundingClientRect()) }; }));
await browser.close();
