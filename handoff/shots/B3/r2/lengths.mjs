// Document height per section in viewports (plan 1.1's table), film and still modes.
// usage: node lengths.mjs <url> <W>x<H> [--reduced] [--touch]
import { chromium } from "playwright-core";
const [url = "http://localhost:3100/lab/promoted/", size = "1440x900", ...rest] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const flag = (f) => rest.includes(f);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const touch = flag("--touch");
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: touch ? 3 : 1, isMobile: touch, hasTouch: touch, reducedMotion: flag("--reduced") ? "reduce" : "no-preference" });
await page.goto(url, { waitUntil: "load" });
await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const vh = innerHeight;
  const rows = [];
  const main = document.querySelector("main");
  for (const el of [...main.children, document.querySelector("footer")]) {
    const b = el.getBoundingClientRect();
    rows.push([el.id || el.tagName.toLowerCase(), Math.round(b.height), +(b.height / vh).toFixed(2)]);
  }
  const doc = document.documentElement.scrollHeight;
  return { mode: document.documentElement.dataset.kfilm, rows, doc, total: +(doc / vh).toFixed(2), sw: document.documentElement.scrollWidth };
});
console.log(`${size} ${url} mode ${r.mode}: document ${r.doc} px = ${r.total} viewports, scrollWidth ${r.sw}`);
for (const [id, h, v] of r.rows) console.log(`  ${id.padEnd(14)} ${String(h).padStart(6)} px  ${v}`);
await browser.close();
