// The landing's accessibility tree at one viewport (film): the controls keep their names when their labels are hidden.
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1280x720").split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => { const f = window.__kfilm; const P = f.clock.progressOf(3, 0.4); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); });
await page.waitForTimeout(1500);
console.log(await page.locator('[data-act-slot="trace"]').ariaSnapshot());
await browser.close();
