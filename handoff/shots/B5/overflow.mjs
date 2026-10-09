// Horizontal overflow: the document, and any element of B5's sections past the viewport's right edge (or left of
// 0), at many widths, plain and with the WCAG 1.4.12 text-spacing override.
import { chromium } from "playwright-core";
const IDS = ["history", "developers", "open-source", "ecosystem"];
const SPACING = "*{line-height:1.5!important;letter-spacing:.12em!important;word-spacing:.16em!important}p{margin-bottom:2em!important}";
const browser = await chromium.launch({ channel: "msedge" });
const widths = [320, 360, 390, 430, 640, 768, 820, 1024, 1180, 1280, 1366, 1440, 1920];
for (const spacing of [false, true]) {
  for (const width of spacing ? [320, 390, 768, 1440] : widths) {
    const phone = width < 640;
    const context = await browser.newContext({ viewport: { width, height: 900 }, isMobile: phone, hasTouch: phone, deviceScaleFactor: phone ? 2 : 1 });
    const page = await context.newPage();
    await page.goto("http://localhost:3100/", { waitUntil: "networkidle" });
    await page.evaluate(() => document.fonts.ready);
    if (spacing) await page.addStyleTag({ content: SPACING });
    await page.waitForTimeout(300);
    const r = await page.evaluate((ids) => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      for (const id of ids) {
        const section = document.getElementById(id);
        for (const el of section.querySelectorAll("*")) {
          // Elements inside a horizontal scroller are allowed past the edge: they scroll.
          const scroller = el.closest(".history, pre, .code-block-body");
          if (scroller && scroller !== el) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 && r.height === 0) continue;
          if (r.right > vw + 0.5 || r.left < -0.5) out.push(`${id} ${el.tagName.toLowerCase()}.${String(el.className.baseVal ?? el.className).split(" ")[0]} [${Math.round(r.left)},${Math.round(r.right)}]`);
        }
      }
      return { vw, sw: document.documentElement.scrollWidth, layout: window.innerWidth, out: out.slice(0, 8), count: out.length };
    }, IDS);
    console.log(`${spacing ? "text-spacing " : ""}${width}: clientWidth ${r.vw} scrollWidth ${r.sw} innerWidth ${r.layout}; B5 elements past an edge: ${r.count} ${r.out.join(" | ")}`);
    await context.close();
  }
}
await browser.close();
