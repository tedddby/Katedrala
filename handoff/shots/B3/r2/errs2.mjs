// The hinge script's sequence (networkidle, then straight to #how-it-works), repeated, catching React's warning
// with the component stack React logs beside it.
import { chromium } from "playwright-core";
const [url = "http://localhost:3100/lab/promoted/", size = "390x844", runs = "4"] = process.argv.slice(2);
const [width, height] = size.split("x").map(Number);
const browser = await chromium.launch({ channel: "msedge", headless: true });
for (let i = 0; i < Number(runs); i++) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 768, hasTouch: width < 768 });
  const page = await ctx.newPage();
  const out = [];
  page.on("console", async (m) => {
    if (m.type() !== "error") return;
    const args = await Promise.all(m.args().map((a) => a.jsonValue().catch(() => "?")));
    out.push(args.map((a) => String(a).slice(0, 600)).join(" | "));
  });
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.locator("#how-it-works").scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  console.log(`run ${i + 1}: ${out.length} errors`);
  for (const o of out) console.log("  " + o);
  await ctx.close();
}
await browser.close();
