// Title blocks on the kit route: each line's right edge (flush right), the stops' painted size, and a capture.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await page.goto("http://localhost:3100/lab/kit/", { waitUntil: "load" });
  await page.waitForTimeout(1200);
  const r = await page.evaluate(() =>
    [...document.querySelectorAll(".titleblock")].map((tb) => ({
      lines: [...tb.children].map((c) => {
        const range = document.createRange();
        range.selectNodeContents(c);
        const rects = [...range.getClientRects()].filter((x) => x.width > 0);
        return Math.round(Math.max(...rects.map((x) => x.right)) * 10) / 10;
      }),
      stops: [...tb.querySelectorAll(".titleblock-stop")].map((s) => {
        const b = s.getBoundingClientRect();
        return `${b.width}x${b.height} clip ${getComputedStyle(s).clipPath}`;
      }),
    })),
  );
  console.log(`${w}x${h}:`, JSON.stringify(r));
  const tb = page.locator(".titleblock").first();
  await tb.scrollIntoViewIfNeeded();
  await tb.screenshot({ path: `r2/cap/tb-${w}.png` });
  await page.close();
}
await browser.close();
