import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate((t) => { const f = window.__kfilm; const P = f.clock.progressOf(1, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, 0.76);
await page.waitForTimeout(3000);
await page.screenshot({ path: "r2/cap2/dark3-a.png", clip: { x: 800, y: 560, width: 640, height: 340 } });
await page.evaluate(() => { const f = window.__kfilm; f.stage.invalidate(); f.relayout = true; f.wake(); });
await page.waitForTimeout(1500);
await page.screenshot({ path: "r2/cap2/dark3-b.png", clip: { x: 800, y: 560, width: 640, height: 340 } });
// Read the canvas pixels directly at a point in the dark region.
console.log(await page.evaluate(() => { const c = document.querySelector("[data-film-canvas]"); const gl = c.getContext("webgl2"); const px = new Uint8Array(4); gl.readPixels(1130, 900 - 700, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return [...px]; }));
await browser.close();
