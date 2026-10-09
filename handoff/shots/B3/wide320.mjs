// At 320 px with the WCAG 1.4.12 text-spacing override: everything whose box runs past the screen, deepest
// first, so the element that widens the layout viewport is found (not just its ancestors).
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
await page.waitForTimeout(600);
const r = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.right <= 320.5) continue;
    if (el.closest("header.site-nav")) continue;
    // Keep only elements none of whose children also run past (the deepest culprits).
    const childOver = [...el.children].some((c) => c.getBoundingClientRect().right > 320.5);
    if (childOver) continue;
    // Skip what is clipped by an overflow ancestor inside the page.
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) { const o = getComputedStyle(a).overflowX; if (o !== "visible") { clipped = true; break; } a = a.parentElement; }
    if (clipped) continue;
    out.push({ unit: el.closest("section[id]")?.id ?? el.closest("footer,header")?.tagName, el: el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.split(/\s+/).slice(0, 3).join(".") : ""), text: (el.innerText || el.textContent || "").slice(0, 50).replace(/\n/g, " "), right: Math.round(b.right * 10) / 10 });
  }
  return { vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, out };
});
console.log(JSON.stringify(r, null, 1));
await browser.close();
