// How wide must the hero lede be to take two lines (D5) at each width?
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [width, height] of [[1440, 900], [1920, 1080], [1280, 720], [1024, 768]]) {
  const page = await browser.newPage({ viewport: { width, height } });
  await page.goto("http://localhost:3100/lab/cinematic/", { waitUntil: "load" });
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const lede = document.querySelector("[data-film-hero] p");
    const out = [];
    for (const rem of [31, 32, 33, 34, 35, 36, 37, 38]) {
      lede.style.maxWidth = rem + "rem";
      const range = document.createRange();
      range.selectNodeContents(lede);
      const lines = new Set([...range.getClientRects()].map((q) => Math.round(q.top))).size;
      out.push(`${rem}rem:${lines}`);
    }
    // Five columns of the page frame.
    const frame = Math.min(innerWidth - 2 * parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--page-gutter")) , 1320);
    return { out: out.join(" "), heroWidth: Math.round(document.querySelector("[data-film-hero]").getBoundingClientRect().width), text: lede.textContent.length };
  });
  console.log(width, JSON.stringify(r));
  await page.close();
}
await browser.close();
