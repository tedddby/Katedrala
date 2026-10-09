// The act marks: scrolling the whole film marks kfilm:act-<id> once per act, in order.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.trigger, null, { timeout: 60000 });
await page.waitForTimeout(1500);
await page.evaluate(() => new Promise((res) => {
  const tr = window.__kfilm.trigger; const t0 = performance.now();
  const step = () => { const k = Math.min(1, (performance.now() - t0) / 9000); window.scrollTo({ top: tr.start + k * (tr.end - tr.start), behavior: "instant" }); if (k < 1) requestAnimationFrame(step); else setTimeout(res, 800); };
  requestAnimationFrame(step);
}));
console.log(await page.evaluate(() => performance.getEntriesByType("mark").filter((m) => m.name.startsWith("kfilm")).map((m) => `${m.name} ${Math.round(m.startTime)}`).join("\n")));
await browser.close();
