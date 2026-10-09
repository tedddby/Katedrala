import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const spacing of [false, true]) {
  const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  if (spacing) await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
  await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const rows = [];
    for (const el of document.querySelectorAll("body *")) {
      const b = el.getBoundingClientRect();
      if (b.width === 0) continue;
      const sw = el.scrollWidth, cw = el.clientWidth;
      if (b.right > 321 || (sw > cw + 1 && getComputedStyle(el).overflowX === "visible" && cw > 0)) {
        rows.push({ el: el.tagName.toLowerCase() + "." + String(el.className).split(/\s+/).slice(0, 2).join("."), unit: el.closest("section[id]")?.id ?? el.closest("footer,header")?.tagName ?? "body", right: Math.round(b.right), sw, cw, pos: getComputedStyle(el).position });
      }
    }
    return { vw: innerWidth, cw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth, bodySW: document.body.scrollWidth, rows: rows.slice(0, 40) };
  });
  console.log(spacing ? "TEXT-SPACING" : "NORMAL", JSON.stringify({ vw: r.vw, cw: r.cw, sw: r.sw, bodySW: r.bodySW }));
  for (const row of r.rows) console.log("  ", JSON.stringify(row));
  await ctx.close();
}
await browser.close();
