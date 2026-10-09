// The harness's full-page segments (clip + fullPage), in still mode: does the headline survive?
import { chromium } from "playwright-core";
const film = process.argv.includes("--film");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: film ? "no-preference" : "reduce", colorScheme: "dark" });
const page = await context.newPage();
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "networkidle" });
await page.waitForTimeout(1600);
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 540) { await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y); await page.waitForTimeout(110); }
await page.waitForTimeout(1500);
for (let i = 0; i < 3; i++) {
  await page.screenshot({ path: `cap/fp2-${i}.png`, clip: { x: 0, y: 0, width: 1440, height: 700 }, fullPage: true, scale: "css" });
}
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
await page.waitForTimeout(500);
await page.screenshot({ path: `cap/fp2-3.png`, clip: { x: 0, y: 0, width: 1440, height: 700 }, fullPage: true, scale: "css" });
await browser.close();
