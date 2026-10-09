// Smallest rendered SVG text in each of my plates' drawings, per width (explorer in both scales).
import { launch, open, frames } from "./lib.mjs";
const browser = await launch();
const widths = (process.argv[2] ?? "320,360,390,430,560,639,640,768,900,1023,1024,1180,1279,1280,1366,1440,1920").split(",").map(Number);
const rows = [];
for (const w of widths) {
  const { page, context } = await open(browser, { width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 1024 });
  const measure = () => page.evaluate(() => {
    const out = {};
    for (const id of ["architecture", "gravity", "entropy", "rules"]) {
      let min = Infinity, which = "";
      for (const t of document.querySelectorAll(`#${id} svg text`)) {
        if (!t.getClientRects().length) continue;
        const g = t.closest("g");
        let hidden = false;
        for (let e = t; e && e.tagName !== "svg"; e = e.parentElement) if (getComputedStyle(e).opacity === "0") hidden = true;
        if (hidden) continue;
        const svg = t.ownerSVGElement;
        const ctm = t.getScreenCTM();
        const fs = parseFloat(getComputedStyle(t).fontSize);
        const px = fs * Math.hypot(ctm.a, ctm.b);
        if (px < min) { min = px; which = t.textContent.slice(0, 20); }
      }
      out[id] = `${min.toFixed(1)} (${which})`;
    }
    return out;
  });
  const a = await measure();
  // The explorer's other scale.
  const other = await page.evaluate(() => document.querySelector('#architecture [role="radio"][aria-checked="false"]')?.dataset.mode);
  await page.locator(`#architecture [role="radio"][data-mode="${other}"]`).click();
  await page.waitForTimeout(700);
  const b = await measure();
  rows.push(`${w}\texplorer ${a.architecture} / ${other} ${b.architecture}\tgravity ${a.gravity}\tentropy ${a.entropy}\trules ${a.rules}`);
  await context.close();
}
console.log(rows.join("\n"));
await browser.close();
