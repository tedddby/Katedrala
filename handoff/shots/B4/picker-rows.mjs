import { launch, open } from "./lib.mjs";
const browser = await launch();
for (const w of [320, 360, 390, 430, 480, 560, 600, 640, 700, 768, 900, 1023, 1024, 1100, 1200, 1259, 1260, 1280, 1366, 1440, 1920]) {
  const vp = { width: w, height: 900, deviceScaleFactor: 1, isMobile: w < 768, hasTouch: w < 768 };
  const { page, context } = await open(browser, vp);
  const rows = await page.$$eval('#gravity [role="radio"]', (els) => {
    const tops = new Map();
    for (const e of els) { const t = Math.round(e.getBoundingClientRect().top); tops.set(t, (tops.get(t) ?? 0) + 1); }
    return [...tops.values()].join("+");
  });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  console.log(w, rows, "overflow", over);
  await context.close();
}
await browser.close();
