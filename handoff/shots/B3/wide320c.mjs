import { chromium } from "playwright-core";
const browser = await chromium.launch({ channel: "msedge" });
const ctx = await browser.newContext({ viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: "* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }" });
await page.waitForTimeout(600);
const r = await page.evaluate(() => {
  const rows = {};
  for (const el of document.querySelectorAll("main *, footer *")) {
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.right <= 320.5) continue;
    // ignore content inside a horizontal scroller or clip (it cannot widen the page)
    let a = el.parentElement, inside = false;
    while (a && a !== document.body) { const o = getComputedStyle(a).overflowX; if (o !== "visible") { inside = true; break; } a = a.parentElement; }
    if (inside) continue;
    const unit = el.closest("section[id]")?.id ?? "footer";
    (rows[unit] ??= []).push(`${el.tagName.toLowerCase()}.${String(el.className).split(/\s+/).slice(0, 2).join(".")} r=${Math.round(b.right)} "${(el.innerText ?? el.textContent ?? "").slice(0, 40).replace(/\n/g, " ")}"`);
  }
  return { innerWidth, rows };
});
console.log(r.innerWidth);
for (const [u, list] of Object.entries(r.rows)) { console.log(u, list.length); for (const l of list.slice(-6)) console.log("   ", l); }
await browser.close();
