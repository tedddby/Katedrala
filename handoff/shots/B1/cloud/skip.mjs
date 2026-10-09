// "Skip the film": the second Tab stop, an instant jump past the film, focus moved there.
import { chromium } from "playwright-core";
const reduced = process.argv.includes("--reduced");
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 30000 });
await page.waitForTimeout(1500);
await page.keyboard.press("Tab");
await page.keyboard.press("Tab");
const focused = await page.evaluate(() => ({ text: document.activeElement.textContent, href: document.activeElement.getAttribute("href"), visible: document.activeElement.getBoundingClientRect().top >= 0 }));
const t0 = Date.now();
await page.keyboard.press("Enter");
const ys = [];
for (let i = 0; i < 6; i++) { ys.push(await page.evaluate(() => Math.round(scrollY))); await page.waitForTimeout(60); }
const after = await page.evaluate(() => {
  const end = document.getElementById("film-end");
  return { hash: location.hash, endTop: Math.round(end.getBoundingClientRect().top), active: document.activeElement?.id || document.activeElement?.tagName, under: document.documentElement.dataset.kfilmUnder !== undefined, nav: getComputedStyle(document.querySelector(".site-nav")).backgroundColor };
});
console.log(JSON.stringify({ reduced, focused, path: ys, ...after }));
await browser.close();
