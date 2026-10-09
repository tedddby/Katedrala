// Horizontal overflow from my plates at narrow widths, with and without the WCAG 1.4.12 text-spacing override:
// the page's scroll width, and any element in my plates whose box runs past the viewport (clipped ones excluded).
import { launch, open } from "./lib.mjs";
const TEXT_SPACING = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`;
const browser = await launch();
for (const w of (process.argv[2] ?? "320,360,390,414,430").split(",").map(Number)) {
  for (const spacing of [false, true]) {
    const { page, context } = await open(browser, { width: w, height: 800, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    if (spacing) await page.addStyleTag({ content: TEXT_SPACING });
    await page.waitForTimeout(400);
    const r = await page.evaluate((w) => {
      const out = [];
      const clipped = (el) => { for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) { const s = getComputedStyle(e); if (s.overflowX === "hidden" || s.overflowX === "auto" || s.overflowX === "scroll" || s.overflowX === "clip") { const r = e.getBoundingClientRect(); if (r.right <= w + 0.5) return true; } } return false; };
      for (const id of ["architecture", "gravity", "entropy", "rules"]) {
        for (const el of document.querySelectorAll(`#${id} *`)) {
          if (!el.getClientRects().length) continue;
          const b = el.getBoundingClientRect();
          if (b.right > w + 0.5 && !clipped(el)) out.push(`${id} ${el.tagName.toLowerCase()}.${String(el.getAttribute("class") ?? "").split(" ")[0]} right ${b.right.toFixed(1)}`);
        }
      }
      return { scrollWidth: document.documentElement.scrollWidth, out: out.slice(0, 12), count: out.length };
    }, w);
    console.log(w, spacing ? "text-spacing" : "plain", "scrollWidth", r.scrollWidth, "overflowing", r.count, r.out.join(" | "));
    await context.close();
  }
}
await browser.close();
