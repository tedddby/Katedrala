import { launch, open } from "./lib.mjs";
const browser = await launch();
for (const w of [1024, 1440]) {
  const { page, context } = await open(browser, { width: w, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false });
  console.log(w, await page.evaluate(() => {
    const g = document.querySelector("#gravity .drawing svg");
    const lvl = g.querySelector(".drawing-level-label");
    const lab = g.querySelector(".drawing-label");
    const ex = document.querySelector("#architecture .explorer-sheet svg");
    const bay = ex.querySelector(".plan-bay-label");
    const ctm = (t) => { const m = t.getScreenCTM(); return Math.hypot(m.a, m.b).toFixed(3); };
    return {
      gravitySvgWidth: g.getBoundingClientRect().width,
      levelFont: getComputedStyle(lvl).fontSize, levelInline: lvl.style.fontSize, levelCtm: ctm(lvl),
      labelFont: getComputedStyle(lab).fontSize, labelCtm: ctm(lab),
      bayFont: getComputedStyle(bay).fontSize, bayCtm: ctm(bay), memberUnit: getComputedStyle(ex).getPropertyValue("--member-unit"), sheetW: ex.getBoundingClientRect().width,
    };
  }));
  await context.close();
}
await browser.close();
