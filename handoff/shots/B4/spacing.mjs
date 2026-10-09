// Overflow at narrow widths, with and without the WCAG 1.4.12 text-spacing override; lists my plates' offenders.
import { launch, open, frames } from "./lib.mjs";
const SPACING = `* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }`;
const browser = await launch();
for (const w of (process.argv[2] ?? "320,360,390,430").split(",").map(Number)) {
  for (const spacing of [false, true]) {
    const { page, context } = await open(browser, { width: w, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (spacing) await page.addStyleTag({ content: SPACING });
    await page.waitForTimeout(400);
    await frames(page, 3);
    const r = await page.evaluate((w) => {
      const doc = document.documentElement;
      const offenders = [];
      for (const id of ["architecture", "gravity", "entropy", "rules"]) {
        for (const el of document.querySelectorAll(`#${id} *`)) {
          const b = el.getBoundingClientRect();
          if (b.width === 0 || el.closest("svg") && el.tagName !== "svg") continue;
          // Ignore content inside horizontal scrollers (they scroll by design).
          let p = el.parentElement, scrolled = false;
          while (p && p.id !== id) { const cs = getComputedStyle(p); if ((cs.overflowX === "auto" || cs.overflowX === "scroll" || cs.overflowX === "hidden" || cs.overflowX === "clip") && p.scrollWidth > p.clientWidth + 1) { scrolled = true; break; } if (cs.overflowX === "hidden" || cs.overflowX === "clip") { scrolled = true; break; } p = p.parentElement; }
          if (scrolled) continue;
          if (b.right > w + 0.5) offenders.push(`${id} ${el.tagName.toLowerCase()}.${[...el.classList].join(".")} right=${b.right.toFixed(1)} "${(el.textContent || "").trim().slice(0, 40)}"`);
        }
      }
      return { overflow: doc.scrollWidth - doc.clientWidth, offenders: offenders.slice(0, 12) };
    }, w);
    console.log(w, spacing ? "spacing" : "normal", "page overflow", r.overflow);
    for (const o of r.offenders) console.log("    ", o);
    await context.close();
  }
}
await browser.close();
