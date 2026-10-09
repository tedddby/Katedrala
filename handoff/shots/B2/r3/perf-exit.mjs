// Times the evidence overlay's update across the act's end (t 0.97 to 1.03), crossing it five times each way.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(1500);
const out = await page.evaluate(async () => {
  const f = window.__kfilm;
  const frame = () => new Promise((r) => requestAnimationFrame(() => r()));
  const go = (act, t) => { const P = f.clock.progressOf(act, t); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); };
  go(1, 0.9); for (let i = 0; i < 30; i++) await frame();
  const o = f.overlays[1];
  const orig = o.update.bind(o);
  const log = [];
  o.update = (t) => { const t0 = performance.now(); orig(t); const d = performance.now() - t0; if (d >= 1) log.push(`${t.toFixed(3)}:${d.toFixed(1)}`); };
  for (let rep = 0; rep < 5; rep++) {
    for (let k = 0; k <= 40; k++) { go(1, 0.95 + k * 0.002); await frame(); }
    for (let k = 40; k >= 0; k--) { go(1, 0.95 + k * 0.002); await frame(); }
  }
  return log;
});
console.log(out.length ? out.join(" ") : "no update over 1 ms");
await browser.close();
