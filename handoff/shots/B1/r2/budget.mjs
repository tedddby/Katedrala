// Still layout: which figures hold pixels as the page scrolls (at most two, all within a viewport of the window),
// and that each is drawn when it comes near. usage: node budget.mjs <W>x<H> <reduced|nowebgl>
import { chromium } from "playwright-core";
const [size = "1440x900", kind = "reduced"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const mobile = width < 600;
const args = kind === "nowebgl" ? ["--disable-webgl", "--disable-webgl2", "--disable-3d-apis"] : [];
const browser = await chromium.launch({ channel: "msedge", headless: true, args });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 1, isMobile: mobile, hasTouch: mobile, reducedMotion: kind === "reduced" ? "reduce" : "no-preference" });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => window.__kfilm?.figures?.length > 0, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const end = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
const rows = [];
let maxHolding = 0;
for (let y = 0; y <= end; y += Math.round(height / 2)) {
  await page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => window.__kfilm.figures.map((f) => {
    const b = f.el.getBoundingClientRect();
    const near = b.bottom > -innerHeight && b.top < 2 * innerHeight;
    return `${f.act.id}:${f.fallback?.drawn ? "px" : "--"}${near ? "" : "(far)"}${f.canvas.width}x${f.canvas.height}`;
  }));
  const holding = r.filter((s) => s.includes(":px")).length;
  maxHolding = Math.max(maxHolding, holding);
  rows.push(`${y}: ${r.join(" ")}`);
}
console.log(rows.join("\n"));
console.log(JSON.stringify({ size, kind, maxHolding, dprCap: await page.evaluate(() => Math.max(...window.__kfilm.figures.map((f) => f.canvas.width / Math.max(1, f.el.getBoundingClientRect().width)))) }));
await browser.close();
