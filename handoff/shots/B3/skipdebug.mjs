import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => { const a = document.createElement("span"); a.id = "film-start"; document.querySelector("main").prepend(a); });
await page.waitForTimeout(200);
for (let i = 0; i < 4; i++) {
  await page.keyboard.press("Tab");
  console.log(i + 1, await page.evaluate(() => { const a = document.activeElement; const b = a.getBoundingClientRect(); return `${a.tagName} ${a.outerHTML.slice(0, 90)} @${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)} display=${getComputedStyle(a).display}`; }));
}
await browser.close();
