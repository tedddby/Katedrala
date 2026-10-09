// Full page at a width, scrolled through first so every drawing has settled; plus a list of positioned elements
// whose containing block is a section (what size containment on .section could have moved).
import { chromium } from "playwright-core";
const [w, h] = (process.argv[2] ?? "1440x900").split("x").map(Number);
const out = process.argv[3] ?? `r1/full-${w}.png`;
const browser = await chromium.launch({ channel: "msedge" });
const touch = w < 768;
const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: touch, hasTouch: touch });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += Math.round(h * 0.6)) { await page.evaluate((t) => window.scrollTo(0, t), y); await page.waitForTimeout(90); }
await page.waitForTimeout(1500);
const moved = await page.evaluate(() => {
  const rows = [];
  for (const el of document.querySelectorAll("main section *")) {
    const pos = getComputedStyle(el).position;
    if (pos !== "absolute" && pos !== "fixed") continue;
    // nearest positioned ancestor inside the section?
    let a = el.parentElement, found = null;
    while (a) { if (a.matches("main > section")) { found = "section"; break; } if (getComputedStyle(a).position !== "static") { found = "positioned"; break; } a = a.parentElement; }
    if (found === "section") rows.push(`${el.closest("section").id}: ${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 3).join(".")}`);
  }
  return rows;
});
console.log("absolute/fixed elements whose containing block is now the section:", moved.length, JSON.stringify(moved.filter((m) => !m.includes("sr-only"))));
await page.screenshot({ path: out, fullPage: true });
await browser.close();
