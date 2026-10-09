// Captures the hero drawing at fixed times after load to inspect the settle motion.
import { chromium } from "playwright-core";
const [url, out] = process.argv.slice(2);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(url, { waitUntil: "domcontentloaded" });
const fig = page.locator(".drawing").first();
await page.waitForFunction(() => document.querySelector(".drawing")?.getAttribute("data-settle") === "running", null, { timeout: 15000 });
const t0 = Date.now();
for (const ms of [120, 450, 900, 1400, 2200]) {
  const wait = ms - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await fig.screenshot({ path: `${out}/settle-${String(ms).padStart(4, "0")}.png` });
}
const state = await page.evaluate(() => document.querySelector(".drawing")?.getAttribute("data-settle"));
console.log("state after 2.2s:", state);
await browser.close();
