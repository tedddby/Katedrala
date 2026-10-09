// Whether Act III's bold path follows the camera: its drawn path after scrolling on through C4, against the same
// path drawn afresh at that moment. Usage: node r3/bold-stale.mjs <w>x<h>
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const go = (t) => page.evaluate((t) => { const f = window.__kfilm; const P = f.clock.progressOf(2, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); }, t);
await go(0.8); await page.waitForTimeout(2500);
await go(0.99); await page.waitForTimeout(2500);
const r = await page.evaluate(() => {
  const f = window.__kfilm;
  const bold = document.querySelector("[data-ch-path]");
  const before = bold.getAttribute("d");
  const o = f.overlays[2];
  if ("boldD" in o) o.boldD = "";
  o.update(0.99);
  const after = bold.getAttribute("d");
  const pts = (d) => [...d.matchAll(/[ML]([\d.-]+) ([\d.-]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  const a = pts(before), b = pts(after);
  let max = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) max = Math.max(max, Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]));
  return { n: a.length, maxShift: max.toFixed(1) };
});
console.log(`${w}x${h}: bold path points ${r.n}, largest gap between drawn and fresh ${r.maxShift}px`);
await browser.close();
