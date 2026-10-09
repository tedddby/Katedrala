// Captures the opening (before any scroll) at fixed times after navigation, and reports when the stage began.
// usage: node intro.mjs <outDir> <W>x<H> <ms1,ms2,...> [--prefix name]
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
const [outDir, size, list, ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const prefix = rest.includes("--prefix") ? rest[rest.indexOf("--prefix") + 1] : "intro";
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "msedge", headless: true });
const mobile = width < 600;
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile });
const t0 = Date.now();
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "commit" });
await page.addStyleTag({ content: "nextjs-portal{display:none!important}" }).catch(() => {});
for (const ms of list.split(",").map(Number)) {
  const wait = t0 + ms - Date.now();
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${outDir}/${prefix}-${String(ms).padStart(5, "0")}ms.png` });
}
const marks = await page.evaluate(() => {
  const nav = performance.getEntriesByType("navigation")[0];
  const m = performance.getEntriesByName("kfilm:first-frame")[0];
  return { firstFrame: m ? Math.round(m.startTime) : null, domContentLoaded: Math.round(nav.domContentLoadedEventEnd), load: Math.round(nav.loadEventEnd) };
});
console.log(JSON.stringify(marks));
await browser.close();
