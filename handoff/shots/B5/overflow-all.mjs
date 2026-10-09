import { chromium } from "playwright-core";
const SPACING = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
const browser = await chromium.launch({ channel: "msedge" });
const context = await browser.newContext({ viewport: { width: 320, height: 900 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
const page = await context.newPage();
await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.addStyleTag({ content: SPACING });
await page.waitForTimeout(300);
const r = await page.evaluate(() => {
  const out = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right > 320.5 && !el.closest("pre, .history, [class*='scroll'], .overflow-x-auto")) {
      const unit = el.closest("main > section[id]")?.id ?? el.closest("header,footer")?.tagName.toLowerCase() ?? "?";
      // keep only the outermost offender per unit
      if (!out.some((o) => o.el.contains(el))) out.push({ el, s: `${unit}: ${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(" ").slice(0, 2).join(".")} right ${r.right.toFixed(1)}` });
    }
  }
  return out.map((o) => o.s).slice(0, 15);
});
console.log(r.join("\n"));
await browser.close();
