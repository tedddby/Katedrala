import { launch, open } from "./lib.mjs";
const browser = await launch();
for (const w of [360, 390, 430, 520, 600, 639]) {
  const { page, context } = await open(browser, { width: w, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const r = await page.evaluate(() => {
    const svg = document.querySelector("#rules .violation-portrait");
    const sizes = [...svg.querySelectorAll("text")].map((t) => { const ctm = t.getScreenCTM(); return parseFloat(getComputedStyle(t).fontSize) * Math.hypot(ctm.a, ctm.b); });
    const lede = parseFloat(getComputedStyle(document.querySelector("#rules .lede")).fontSize);
    return { width: svg.getBoundingClientRect().width.toFixed(0), min: Math.min(...sizes).toFixed(1), max: Math.max(...sizes).toFixed(1), lede };
  });
  console.log(w, JSON.stringify(r));
  await context.close();
}
await browser.close();
