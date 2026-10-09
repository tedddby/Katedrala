// The pixel-ratio step-down: the stage starts at min(devicePixelRatio, 2) and steps down by 0.5 (to 1 at least) while
// the median of 90 drawn frames exceeds 21 ms. Scrubs the film and samples the stage's pixel ratio and the canvas.
import { chromium } from "playwright-core";
const [size = "390x844", dprArg = "3"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: Number(dprArg), isMobile: mobile, hasTouch: mobile });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
const samples = [];
const sample = async (label) => samples.push({ label, ...(await page.evaluate(() => ({ stageDpr: window.__kfilm.stage.dpr, canvas: `${window.__kfilm.canvas.width}x${window.__kfilm.canvas.height}`, settled: window.__kfilm.dprSettled }))) });
await sample("start");
await page.evaluate(() => new Promise((res) => {
  const f = window.__kfilm; const tr = f.trigger; const t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 20000); window.scrollTo({ top: tr.start + k * 0.55 * (tr.end - tr.start), behavior: "instant" }); if (k < 1) requestAnimationFrame(step); else res(); };
  requestAnimationFrame(step);
}));
await sample("after 20 s scrub");
await page.waitForTimeout(500);
console.log(JSON.stringify(samples));
await browser.close();
