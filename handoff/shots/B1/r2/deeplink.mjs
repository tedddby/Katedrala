// Still layout, a deep link far below the hero: the first figure drawn marks kfilm:first-frame and data-kfilm-live.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const hash of ["", "#trace"]) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  await page.goto(`http://localhost:3100/lab/cinematic/${hash}`, { waitUntil: "load" });
  await page.waitForTimeout(3500);
  console.log(hash || "(top)", JSON.stringify(await page.evaluate(() => ({
    live: document.documentElement.dataset.kfilmLive !== undefined,
    first: performance.getEntriesByName("kfilm:first-frame").map((m) => Math.round(m.startTime)),
    drawn: window.__kfilm.figures.map((f) => `${f.act.id}:${f.fallback?.drawn ? "drawn" : "-"}`),
    y: Math.round(scrollY),
  }))));
  await page.close();
}
await browser.close();
