// Every status mark on the page at several widths: the lines it takes now that a long label wraps beside its
// square instead of running past its column, and whether the square still sits on the first line's middle.
import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
for (const [w, h] of [[320, 640], [360, 740], [390, 844], [430, 932], [768, 1024], [1024, 768], [1280, 720], [1440, 900]]) {
  const touch = w < 768;
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const rows = [];
    for (const s of document.querySelectorAll(".status")) {
      const label = s.querySelector(":scope > span");
      const svg = s.querySelector(":scope > svg");
      if (!label || !svg) { rows.push({ odd: s.outerHTML.slice(0, 80) }); continue; }
      const lh = parseFloat(getComputedStyle(label).lineHeight) || 17.6;
      const lb = label.getBoundingClientRect();
      const sb = svg.getBoundingClientRect();
      if (lb.width === 0) continue;
      const lines = Math.round(lb.height / lh);
      const firstMid = lb.top + lh / 2;
      const unit = s.closest("section[id], header, footer")?.id || s.closest("header, footer")?.tagName;
      rows.push({ unit, text: label.innerText, lines, squareOff: Math.round(((sb.top + sb.bottom) / 2 - firstMid) * 10) / 10, right: Math.round(s.getBoundingClientRect().right), vw: innerWidth });
    }
    return rows;
  });
  const wrapped = r.filter((x) => x.lines > 1);
  const off = r.filter((x) => Math.abs(x.squareOff) > 1);
  const over = r.filter((x) => x.right > x.vw);
  console.log(`${w}: ${r.length} marks; wrapped ${wrapped.length}${wrapped.length ? " " + JSON.stringify(wrapped.map((x) => `${x.unit}:${x.text}`)) : ""}; square off-centre ${off.length}${off.length ? JSON.stringify(off) : ""}; past window ${over.length}`);
  await ctx.close();
}
await browser.close();
