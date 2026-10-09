// Renders the plate-kit specimen (/lab/kit/) and measures what the kit promises: crop marks at the sheet's
// corners (12 px, 1 px), the title block's type and place, the bleeds against the window, the status line.
// Usage: node kit.mjs <outDir>
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { chromium } from "playwright-core";
const out = resolve(process.argv[2] ?? "./kit");
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ channel: "msedge" });
const report = {};
for (const [w, h, touch] of [[1440, 900, false], [1024, 768, false], [390, 844, true], [320, 640, true]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: touch ? 2 : 1, isMobile: touch, hasTouch: touch });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://localhost:3100/lab/kit/", { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  const r = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const frame = document.querySelector("#kit .frame").getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(document.querySelector("#kit .frame")).paddingLeft);
    const sheets = [...document.querySelectorAll(".sheet")].map((s) => {
      const b = s.getBoundingClientRect();
      const marks = [...s.querySelectorAll(".crop-marks > span")].map((m) => {
        const mb = m.getBoundingClientRect();
        const cs = getComputedStyle(m);
        return { corner: m.dataset.corner, x: mb.left, y: mb.top, w: mb.width, h: mb.height, visible: cs.visibility, color: cs.borderTopColor === "rgba(0, 0, 0, 0)" ? cs.borderBottomColor : cs.borderTopColor };
      });
      const tb = s.querySelector(".titleblock");
      const tbb = tb?.getBoundingClientRect();
      const tcs = tb && getComputedStyle(tb);
      return {
        left: b.left, right: b.right, width: b.width, top: b.top + scrollY,
        bleedVar: getComputedStyle(s).getPropertyValue("--bleed"),
        marks,
        titleblock: tb && { left: tbb.left, right: tbb.right, bottom: tbb.bottom, sheetBottom: b.bottom, position: tcs.position, font: tcs.fontFamily.split(",")[0], size: tcs.fontSize, color: tcs.color, firstColor: getComputedStyle(tb.firstElementChild).color, text: tb.innerText },
      };
    });
    const statusLine = document.querySelector("#kit .status-line");
    const h2 = document.querySelector("#kit h2").getBoundingClientRect();
    const sl = statusLine.getBoundingClientRect();
    const lede = document.querySelector("#kit .lede").getBoundingClientRect();
    const gauge = getComputedStyle(document.querySelector(".gauge-numerals"));
    return {
      vw, scrollW: document.documentElement.scrollWidth, frameContent: [frame.left + pad, frame.right - pad],
      sheets,
      statusLine: { gapAbove: sl.top - h2.bottom, gapBelow: lede.top - sl.bottom, height: sl.height, items: [...statusLine.children].map((c) => c.innerText) },
      gauge: { size: gauge.fontSize, weight: gauge.fontWeight, tracking: gauge.letterSpacing, family: gauge.fontFamily.split(",")[0], numeric: gauge.fontVariantNumeric, color: gauge.color },
      sectionPadTop: getComputedStyle(document.querySelector("#kit")).paddingTop,
      container: getComputedStyle(document.querySelector("#kit")).containerType,
    };
  });
  report[`${w}x${h}`] = { ...r, errors };
  await page.screenshot({ path: `${out}/kit-${w}.png`, fullPage: true });
  await ctx.close();
}
writeFileSync(`${out}/kit.json`, JSON.stringify(report, null, 1));
console.log(JSON.stringify(report, null, 1));
await browser.close();
