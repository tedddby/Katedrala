import { OUT, VIEWPORTS, launch, open, scrollTo, boxOf, captureBox, frames } from "./lib.mjs";
const browser = await launch();
for (const w of (process.argv[2] ?? "1440").split(",")) {
  const vp = VIEWPORTS[w] ?? { width: Number(w), height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false };
  const { page, context } = await open(browser, vp);
  await scrollTo(page, "#architecture", 0);
  const mode = process.argv[3] ?? "members";
  const radio = page.locator(`#architecture [role="radio"][data-mode="${mode}"]`);
  if ((await radio.getAttribute("aria-checked")) !== "true") await radio.click();
  await page.waitForTimeout(800);
  const box = await boxOf(page, "#architecture .explorer-sheet");
  await captureBox(page, vp, { left: box.left, top: box.top, width: box.width, height: box.height }, `${OUT}explorer-${w}-${mode}.png`);
  await context.close();
}
await browser.close();
