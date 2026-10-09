import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h, touch] of [[1440, 900, false], [390, 844, true]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, deviceScaleFactor: touch ? 3 : 1 });
  await page.goto("http://localhost:3100/lab/cinematic/#trace", { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.dataset.kfilmLive !== undefined && window.__kfilm?.trigger, null, { timeout: 60000 });
  await page.waitForTimeout(2500);
  console.log(`${w}x${h}`, JSON.stringify(await page.evaluate(() => {
    const h2 = document.querySelector('[data-act-slot="trace"] h2');
    const r = h2.getBoundingClientRect();
    const nav = document.querySelector(".site-nav").getBoundingClientRect();
    let op = 1; for (let n = h2; n; n = n.parentElement) op *= Number(getComputedStyle(n).opacity);
    return { h2: h2.textContent, top: Math.round(r.top), bottom: Math.round(r.bottom), navBottom: Math.round(nav.bottom), clearOfBar: r.top >= nav.bottom, opacity: op, at: `${window.__kfilm.pos.id} ${window.__kfilm.pos.t.toFixed(3)}` };
  })));
  await page.close();
}
await browser.close();
