import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const logs = [];
page.on("console", (m) => logs.push(`${m.type()}: ${m.text().slice(0, 300)}`));
page.on("pageerror", (e) => logs.push(`pageerror: ${e.message}`));
await page.goto("http://localhost:3100/lab/cinematic/" + (process.argv[2] ?? ""), { waitUntil: "load" });
await page.waitForTimeout(5000);
const s = await page.evaluate(() => {
  const f = window.__kfilm;
  return {
    kfilm: document.documentElement.dataset.kfilm,
    live: document.documentElement.dataset.kfilmLive,
    scrollY,
    figures: f?.figures?.map((g) => ({ id: g.act.id, near: g.near, drawn: g.fallback?.drawn, rect: g.el.getBoundingClientRect().toJSON() })),
    marks: performance.getEntriesByType("mark").map((m) => m.name),
  };
});
console.log(JSON.stringify(s, null, 1));
console.log(logs.join("\n"));
await browser.close();
