import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined, null, { timeout: 60000 });
await page.waitForTimeout(2000);
await page.evaluate(() => { const f = window.__kfilm; const P = f.clock.progressOf(1, 0.76); window.scrollTo({ top: f.trigger.start + P * (f.trigger.end - f.trigger.start), behavior: "instant" }); });
await page.waitForTimeout(3000);
console.log(await page.evaluate(() => {
  const out = {};
  for (const id of ["kfilm-record-12", "kfilm-record-20"]) { const el = document.getElementById(id); const r = el?.getBoundingClientRect(); out[id] = r && { top: r.top, h: r.height, left: r.left, text: el.textContent }; }
  const rec = document.querySelector("[data-ev-record]").getBoundingClientRect();
  out.record = { top: rec.top, left: rec.left, w: rec.width, h: rec.height };
  out.ties = [...document.querySelectorAll('[data-ev="tie"]')].map((p) => p.getAttribute("d"));
  out.frame = document.querySelector("[data-film-stage]").getBoundingClientRect().top;
  return out;
}));
await browser.close();
