import { OUT, VIEWPORTS, launch, open, scrollTo, captureSection } from "./lib.mjs";
const browser = await launch();
for (const w of (process.argv[2] ?? "1440,1024,390").split(",")) {
  const vp = VIEWPORTS[w];
  const { page, context, messages } = await open(browser, vp);
  await scrollTo(page, "#gravity", 0);
  await page.waitForTimeout(400);
  await captureSection(page, vp, "gravity", `${OUT}gravity-${w}.png`);
  const names = await page.$$eval('#gravity [role="radio"]', (els) => els.map((e) => { const r = e.getBoundingClientRect(); return `${e.textContent}@${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`; }));
  console.log(w, names.join(" | "), messages);
  await context.close();
}
await browser.close();
