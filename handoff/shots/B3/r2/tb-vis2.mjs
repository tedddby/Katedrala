// The same title blocks with and without the stops (removed in the page): do any line's text positions move?
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://localhost:3100/lab/kit/", { waitUntil: "load" });
await page.waitForTimeout(1200);
const measure = () =>
  page.evaluate(() =>
    [...document.querySelectorAll(".titleblock")].map((tb) => {
      const out = [];
      const walker = document.createTreeWalker(tb, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (n.parentElement.closest(".titleblock-stop") || !n.textContent.trim()) continue;
        const r = document.createRange();
        r.selectNodeContents(n);
        const b = r.getBoundingClientRect();
        out.push(`${n.textContent.trim().slice(0, 14)}@${b.left.toFixed(2)}-${b.right.toFixed(2)},${b.top.toFixed(2)}`);
      }
      const box = tb.getBoundingClientRect();
      return { box: `${box.left.toFixed(2)}..${box.right.toFixed(2)} x ${box.height.toFixed(2)}`, text: out };
    }),
  );
const a = await measure();
await page.evaluate(() => document.querySelectorAll(".titleblock-stop").forEach((s) => s.remove()));
const b = await measure();
console.log(JSON.stringify(a) === JSON.stringify(b) ? "identical text positions and boxes with and without the stops" : "DIFFERENT");
console.log(JSON.stringify(a, null, 1));
if (JSON.stringify(a) !== JSON.stringify(b)) console.log(JSON.stringify(b, null, 1));
await browser.close();
