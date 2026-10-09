// Bisects what widens the layout viewport at 320 px under the text-spacing override: hide one part at a time.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const SPACING = "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }";
async function measure(hideSelector) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.addInitScript((css) => {
    document.addEventListener("DOMContentLoaded", () => { const s = document.createElement("style"); s.textContent = css; document.head.append(s); });
  }, SPACING + (hideSelector ? ` ${hideSelector} { display: none !important; }` : ""));
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  const w = await page.evaluate(() => innerWidth);
  await ctx.close();
  return w;
}
console.log("none hidden", await measure(""));
for (const sel of ["body > header", "body > footer", "#top", "#how-it-works", "#architecture", "#gravity", "#entropy", "#impact", "#rules", "#evidence", "#history", "#developers", "#open-source", "#ecosystem", "#get-started", "body > a.skip-link"]) {
  console.log(sel, await measure(sel));
}
await browser.close();
